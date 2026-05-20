import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateReportHtml } from './api/reportTemplate.js';
import reconstructTimelineHandler    from './api/reconstruct-timeline.js';
import collectEvidenceHandler        from './api/collect-evidence.js';
import generateDraftResponseHandler  from './api/generate-draft-response.js';
import generateGapQuestionsHandler   from './api/generate-gap-questions.js';
import generateDisputeDossierHandler from './api/generate-dispute-dossier.js';
import sendDisputeResponseHandler    from './api/send-dispute-response.js';
import classifyMeerwerkHandler       from './api/classify-meerwerk.js';
import sendEmailHandler              from './api/send-email.js';
import projectContactsHandler        from './api/project-contacts.js';
import projectChatHandler            from './api/project-chat.js';
import remindersHandler              from './api/reminders.js';
import processLogHandler             from './api/process-log.js';
import triageInboxHandler            from './api/triage-inbox.js';
import mergeEmailsHandler            from './api/merge-emails.js';
import chatHandler                   from './api/chat.js';
import adminUsageHandler             from './api/admin-usage.js';
import adminAccountsHandler          from './api/admin-accounts.js';
import adminProjectsHandler          from './api/admin-projects.js';
import adminProjectMembersHandler    from './api/admin-project-members.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Phone helpers (used by /api/whatsapp/optin) ───────────────────────────────
// Must produce the same ciphertext as the Deno implementation in the edge function
// so that stored phone numbers can be looked up during inbound message processing.

function normalizePhone(raw) {
  return String(raw).replace(/[^\d]/g, '');
}

function encryptPhone(plain) {
  const keyHex = process.env.WHATSAPP_PHONE_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('WHATSAPP_PHONE_ENCRYPTION_KEY must be a 64-char hex string');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv  = crypto.createHmac('sha256', key).update(plain).digest().slice(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── AI usage tracking ─────────────────────────────────────────────────────────
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  }, // USD per million tokens
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

async function logAIUsage(endpoint, model, usage, projectId = null, metadata = {}) {
  if (!supabaseAdmin || !usage) return;
  try {
    const pricing = MODEL_PRICING[model] || { input: 1.00, output: 5.00 };
    const costUsd = (usage.input_tokens * pricing.input + usage.output_tokens * pricing.output) / 1_000_000;
    await supabaseAdmin.from('ai_usage_logs').insert({
      endpoint,
      model,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cost_usd: costUsd,
      project_id: projectId || null,
      metadata: Object.keys(metadata).length ? metadata : null,
    });
  } catch (err) {
    console.warn('logAIUsage failed:', err.message);
  }
}

const openai = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

// Service role key bypasses RLS — server-side only, never exposed to frontend
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ── Shared: process a raw note through Claude ─────────────────────────────────
async function processNote(note, location = '', labels = [], { projectId = null, source = 'api', attempt = 0 } = {}) {
  const hasLabels = labels && labels.length > 0;
  const labelList = hasLabels ? labels.map(l => `"${l.name}"`).join(', ') : null;

  const labelSection = hasLabels
    ? `\nAvailable project labels: ${labelList}
- label: assign the single most relevant label name from the list above, or null if none fit`
    : `\n- label: null`;

  try {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are an AI assistant for construction project management. Process the following field note and extract structured data. Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

Note: "${note}"
Location: "${location || 'Not specified'}"

Return exactly this JSON structure:
{
  "summary": "1-2 sentence professional summary of the observation",
  "type": "delay|safety|progress|material|rfi|general",
  "flags": ["short tag 1", "short tag 2"],
  "impact": "none|schedule|cost|safety",
  "actionRequired": true or false,
  "suggestRFI": true or false,
  "extractedLocation": "location if mentioned in the note, else null",
  "extractedDate": "ISO date (YYYY-MM-DD) if a specific date is mentioned, else null",
  "label": null
}

Rules:
- type "delay": any work stoppage or slow-down
- type "safety": hazard, incident, near-miss
- type "progress": work completed, milestones
- type "material": supply, delivery, shortage
- type "rfi": needs clarification from designer/engineer
- type "general": anything else
- flags: 1-3 short phrases max (e.g. "Schedule Impact", "Safety Hazard")
- suggestRFI: true if the issue requires formal documentation
- extractedLocation: extract any specific location mentioned (floor, room, grid ref, zone, etc.)
- extractedDate: only set if a specific date is clearly stated, not for relative terms like "today"${labelSection}`
    }]
  });

  const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  logAIUsage('process-log', 'claude-haiku-4-5-20251001', response.usage, projectId, { source });
  return JSON.parse(raw);
  } catch (err) {
    if (err.status === 529 && attempt < 3) {
      const delay = (attempt + 1) * 5000;
      console.log(`API overloaded, retrying in ${delay / 1000}s… (attempt ${attempt + 1}/3)`);
      await new Promise(r => setTimeout(r, delay));
      return processNote(note, location, labels, { projectId, source, attempt: attempt + 1 });
    }
    throw err;
  }
}

// /api/process-log — handled by import at the bottom of the file (api/process-log.js).
// The new handler does extraction + per-workpoint classification + recommendedOutputs in one call.

// ── Extract action items from a field note ────────────────────────────────────
app.post('/api/extract-action-items', async (req, res) => {
  const { note, summary, subcontractors = [] } = req.body;
  if (!note && !summary) return res.status(400).json({ success: false, error: 'Note or summary required' });

  try {
    const subsContext = subcontractors.length
      ? `Subcontractors currently on site:\n${subcontractors.map(s => `- ${s.company}${s.trade ? ` (${s.trade})` : ''}`).join('\n')}`
      : 'No subcontractors registered for this project.';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a construction project manager. Extract actionable tasks from this field log entry.

Field note: "${note}"${summary ? `\nAI summary: "${summary}"` : ''}

${subsContext}

Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.
Return an array of action items (empty array if none needed):

[
  {
    "task": "Clear, specific action to take",
    "assignee": "Back Office" or the exact company name from the subcontractors list,
    "assigneeType": "back_office" or "subcontractor",
    "priority": "high" | "medium" | "low",
    "notes": "Brief reason or context for this action"
  }
]

Rules:
- Only extract concrete, actionable tasks — not observations or descriptions
- "Back Office" tasks: procurement, documentation, client communication, design queries, admin work
- "Subcontractor" tasks: on-site remediation, installation, physical work — assign to the most relevant sub by trade
- If no matching sub exists for a trade, assign to "Back Office" and mention the required trade in notes
- Maximum 5 action items per log entry
- If nothing actionable, return []`
      }]
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const items = JSON.parse(raw);
    logAIUsage('extract-action-items', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, items: Array.isArray(items) ? items : [] });
  } catch (error) {
    console.error('extract-action-items error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Draft an RFI document ─────────────────────────────────────────────────────
app.post('/api/draft-rfi', async (req, res) => {
  const { number, title, context } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a senior construction project engineer. Draft a professional RFI (Request for Information) document.

RFI Number: ${number || 'TBD'}
Subject: ${title}
Background/Context: ${context || 'See subject line.'}

Write a formal, professional RFI with these exact sections:
**SUBJECT:** (one line)
**PROJECT:** Main Campus Build — Phase 2
**DATE:** ${new Date().toLocaleDateString()}
**SUBMITTED BY:** Project Engineer

**DESCRIPTION:**
(2-3 sentences describing the issue clearly)

**REQUEST:**
(Specific questions or clarifications needed — use numbered list)

**IMPACT IF UNRESOLVED:**
(Schedule, cost, or quality impact)

**ATTACHMENTS:** None

Keep it concise, factual, and professional. Use plain text, not excessive formatting.`
      }]
    });

    // Extract text from response (skip thinking blocks)
    const draft = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    logAIUsage('draft-rfi', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, draft });
  } catch (error) {
    console.error('draft-rfi error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Draft client email for RFI ────────────────────────────────────────────────
app.post('/api/draft-rfi-email', async (req, res) => {
  const { rfiNumber, rfiTitle, rfiContext, rfiDraft } = req.body;
  if (!rfiTitle) return res.status(400).json({ success: false, error: 'Title is required' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a construction project engineer. Write a short, professional email to the architect/client summarising this RFI and what is needed.

RFI Number: ${rfiNumber || 'TBD'}
RFI Subject: ${rfiTitle}
Background: ${rfiContext || 'See subject.'}
${rfiDraft ? `RFI Document (for reference):\n${rfiDraft.slice(0, 800)}` : ''}

Write a plain email (no markdown, no **bold**) with:
- Subject line: RFI ${rfiNumber || ''}: ${rfiTitle}
- Polite greeting (Dear Team / Dear Architect)
- 2–3 sentences clearly summarising the issue in plain language
- One sentence stating what response or clarification is needed
- Polite close (Best regards,)
- Leave "Best regards," on its own line at the end — no name below it

Keep it under 150 words. Plain text only.`
      }]
    });

    const email = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    logAIUsage('draft-rfi-email', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, email });
  } catch (error) {
    console.error('draft-rfi-email error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Price RFI — generate pricing proposition from context ─────────────────────
app.post('/api/price-rfi', async (req, res) => {
  const { rfiTitle, rfiContext, rfiDraft, contextItems } = req.body;
  if (!rfiTitle) return res.status(400).json({ success: false, error: 'RFI title is required' });

  const quoteItems    = (contextItems || []).filter(c => c.category === 'quote');
  const contractItems = (contextItems || []).filter(c => c.category === 'contract');
  const docItems      = (contextItems || []).filter(c => c.category === 'document');
  const noteItems     = (contextItems || []).filter(c => c.category === 'note');

  const formatItems = (items) => items.map(c =>
    `- [${c.title}]${c.source ? ` (${c.source})` : ''}: ${c.content.slice(0, 800)}`
  ).join('\n');

  const contextSection = [
    quoteItems.length    ? `**QUOTES / PRICE OFFERS:**\n${formatItems(quoteItems)}`       : '',
    contractItems.length ? `**CONTRACT / SPECIFICATIONS:**\n${formatItems(contractItems)}` : '',
    docItems.length      ? `**DOCUMENTS:**\n${formatItems(docItems)}`                      : '',
    noteItems.length     ? `**NOTES:**\n${formatItems(noteItems)}`                         : '',
  ].filter(Boolean).join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a senior construction quantity surveyor. Based on the RFI below and the project context, draft a concise pricing proposition or cost assessment.

**RFI SUBJECT:** ${rfiTitle}
**RFI CONTEXT:** ${rfiContext || 'See subject.'}
${rfiDraft ? `\n**RFI DOCUMENT:**\n${rfiDraft.slice(0, 1000)}` : ''}

**PROJECT CONTEXT:**
${contextSection || 'No context items available.'}

Return ONLY a valid JSON object — no prose, no markdown, no code fences. Structure:
{
  "items": [
    { "description": "Short work item description", "qty": 1, "unit": "ls", "unit_rate": 1200.00 }
  ],
  "assumptions": [
    "Assumption or basis sentence"
  ]
}
Rules:
- unit_rate: plain number, no currency symbols, no commas (e.g. 960.00)
- Credits/deductions: negative unit_rate (e.g. -450.00)
- qty: number (e.g. 1, 2.5, 10)
- unit: short string (ls, m², m³, hr, day, pc, etc.)
- subtotal is computed by the client — do NOT include it
- 2–12 line items; at least 2 assumptions
- Be factual; reference specific context items where possible`
      }]
    });

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    console.log('[price-rfi] raw AI response:\n', raw.slice(0, 800));

    // Extract JSON object from response (handles code-fence wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[price-rfi] No JSON object in response');
      return res.status(500).json({ success: false, error: `AI did not return JSON. Response: "${raw.slice(0, 150)}"` });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[price-rfi] JSON.parse failed:', e.message);
      console.error('[price-rfi] matched string:', jsonMatch[0].slice(0, 300));
      return res.status(500).json({ success: false, error: `AI returned malformed JSON: ${e.message}` });
    }

    // Normalise key names — Haiku sometimes uses line_items or cost_items
    const itemsArray = parsed.items || parsed.line_items || parsed.cost_items || parsed.lineItems;
    if (!Array.isArray(itemsArray) || itemsArray.length === 0) {
      console.error('[price-rfi] No items found. Keys:', Object.keys(parsed));
      return res.status(500).json({ success: false, error: `AI JSON had no items. Keys: ${Object.keys(parsed).join(', ')}` });
    }

    // Rebuild clean JSON with normalised key
    const proposition = JSON.stringify({ items: itemsArray, assumptions: parsed.assumptions || [] });
    console.log('[price-rfi] OK —', itemsArray.length, 'items');
    logAIUsage('price-rfi', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, proposition });
  } catch (error) {
    console.error('price-rfi error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Generate daily report ─────────────────────────────────────────────────────
app.post('/api/generate-report', async (req, res) => {
  const { date, logs, rfis, tasks, context, projectName, projectLocation } = req.body;

  try {
    // ── Build context sections for the prompt ──────────────────────────────
    const logsSection = (logs || []).length
      ? logs.map(l => `- [${(l.type || 'general').toUpperCase()}] ${l.processedSummary || l.rawNote}${l.location ? ` (${l.location})` : ''}${l.impact && l.impact !== 'none' ? ` — ${l.impact} impact` : ''}`).join('\n')
      : 'No field log entries recorded today.';

    const rfisSection = (rfis || []).length
      ? rfis.map(r => `- ${r.number}: ${r.title} [${r.status.toUpperCase()}]`).join('\n')
      : 'No open RFIs.';

    const tasksSection = (tasks || []).length
      ? tasks.map(t => `- [${t.status === 'completed' ? 'DONE' : t.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING'}] ${t.task} — ${t.assignee || 'Unassigned'}${t.priority === 'high' ? ' [HIGH]' : ''}`).join('\n')
      : 'No action items logged.';

    const dangerItems   = (context || []).filter(c => c.category === 'danger');
    const quoteItems    = (context || []).filter(c => c.category === 'quote');
    const contractItems = (context || []).filter(c => c.category === 'contract');
    const docItems      = (context || []).filter(c => c.category === 'document');
    const noteItems     = (context || []).filter(c => c.category === 'note');

    const contextSection = (context || []).length ? `
DANGER FLAGS (must appear in safetyNotes and alertBoxes):
${dangerItems.length ? dangerItems.map(c => `⚠️ ${c.title}: ${c.content}${c.source ? ` [${c.source}]` : ''}`).join('\n') : 'None.'}

RELEVANT QUOTES:
${quoteItems.length ? quoteItems.map(c => `"${c.content}" — ${c.title}${c.source ? ` (${c.source})` : ''}`).join('\n') : 'None.'}

CONTRACT / DOCUMENT CONTEXT:
${[...contractItems, ...docItems].length ? [...contractItems, ...docItems].map(c => `- ${c.title}: ${c.content}${c.source ? ` [${c.source}]` : ''}`).join('\n') : 'None.'}

BACKGROUND NOTES:
${noteItems.length ? noteItems.map(c => `- ${c.title}: ${c.content}`).join('\n') : 'None.'}
` : '';

    // ── Ask Claude for structured JSON ─────────────────────────────────────
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a construction site report generator. Output ONLY a raw JSON object — no markdown, no code fences, no explanation before or after.

Generate a daily construction site report for: ${date}
Project: ${projectName || 'Construction Project'}
Location: ${projectLocation || 'On Site'}

FIELD LOGS:
${logsSection}

OPEN RFIs:
${rfisSection}

ACTION ITEMS / PUNCH LIST:
${tasksSection}
${contextSection}${dangerItems.length ? `\nCRITICAL: ${dangerItems.length} danger flag(s) — must appear in alertBoxes AND safetyNotes.\n` : ''}
Output this JSON structure (fill every field from the data above):
{"projectName":"...","projectLocation":"...","preparedBy":"...","weather":"...","nextMilestone":"...","handoverTarget":"...","executiveSummary":"2-3 sentence summary, may use HTML bold/italic","workCompleted":[{"title":"...","description":"...","status":"completed"}],"issues":[{"title":"...","description":"...","impactType":"cost","status":"pending"}],"openRfis":[{"number":"...","description":"...","status":"draft"}],"actionItems":{"inProgress":[{"action":"...","responsible":"..."}],"pendingHigh":[{"action":"...","responsible":"..."}],"pendingStandard":[{"action":"...","responsible":"..."}]},"alertBoxes":[],"safetyNotes":{"incidentsReported":false,"reminders":["..."]}}

Rules:
- workCompleted = completed/DONE field logs and tasks
- issues = issue/delay/high-impact logs
- actionItems.inProgress = in_progress tasks
- actionItems.pendingHigh = pending tasks with high priority
- actionItems.pendingStandard = pending tasks with normal/medium priority
- openRfis = mirror the RFI list provided
- impactType must be one of: cost, schedule, quality, compliance, risk
- status values: pending, in_progress, awaiting_approval, closed, draft, submitted
- alertBoxes = empty array unless there are danger flags or critical issues
- If a section has no data use an empty array []`
      }],
    });

    // ── Extract JSON from Claude's response ────────────────────────────────
    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    console.log('[report] Claude rawText length:', rawText.length);
    console.log('[report] Claude rawText preview:', rawText.slice(0, 300));

    if (!rawText.trim()) {
      return res.status(500).json({ success: false, error: 'Claude returned an empty response. Please try again.' });
    }

    // Find the outermost { ... } block
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[report] No JSON object found. Raw:', rawText.slice(0, 800));
      return res.status(500).json({ success: false, error: `Claude did not return JSON. Response started with: "${rawText.slice(0, 120)}"` });
    }

    let reportData;
    try {
      reportData = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[report] JSON parse failed:', parseErr.message);
      console.error('[report] Attempted to parse:', jsonMatch[0].slice(0, 400));
      return res.status(500).json({ success: false, error: `JSON parse error: ${parseErr.message}` });
    }

    console.log('[report] Parsed keys:', Object.keys(reportData));

    // ── Render HTML from structured data ───────────────────────────────────
    let html;
    try {
      html = generateReportHtml(reportData, date);
    } catch (templateErr) {
      console.error('[report] Template render error:', templateErr.message);
      return res.status(500).json({ success: false, error: `Template error: ${templateErr.message}` });
    }

    if (!html) {
      console.error('[report] generateReportHtml returned falsy:', typeof html);
      return res.status(500).json({ success: false, error: 'HTML template returned empty result.' });
    }

    console.log('[report] HTML generated, length:', html.length);

    logAIUsage('generate-report', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, html });
  } catch (error) {
    console.error('generate-report error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── WhatsApp opt-in ───────────────────────────────────────────────────────────
// Called by the Settings page "Connect WhatsApp" modal.
// Encrypts the phone number, upserts whatsapp_users, and sends a template
// message so the user can confirm by replying (which activates their account).
app.post('/api/whatsapp/optin', async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number) {
    return res.status(400).json({ success: false, error: 'phone_number is required' });
  }

  // Require auth: the anon key is in the Authorization header from the frontend
  const authHeader = req.headers.authorization ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  // Verify the JWT and get the user — use the anon key client so RLS kicks in
  const { createClient: mkClient } = await import('@supabase/supabase-js');
  const userClient = mkClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return res.status(401).json({ success: false, error: 'Invalid session' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ success: false, error: 'Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)' });
  }

  // Encrypt phone number before storing
  let encryptedPhone;
  try {
    encryptedPhone = encryptPhone(normalizePhone(phone_number));
  } catch (err) {
    console.error('[whatsapp/optin] Encryption error:', err.message);
    return res.status(503).json({ success: false, error: 'Server encryption not configured' });
  }

  // Upsert: one whatsapp_users row per user — do not overwrite an active connection
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_users')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active') {
    return res.json({ success: true, already_connected: true });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('whatsapp_users')
    .upsert(
      { user_id: user.id, phone_number: encryptedPhone, status: 'pending' },
      { onConflict: 'user_id' },
    );

  if (upsertErr) {
    console.error('[whatsapp/optin] DB upsert error:', upsertErr.message);
    return res.status(500).json({ success: false, error: 'Could not save phone number' });
  }

  // Send opt-in confirmation template via WhatsApp Cloud API
  // The user must reply to activate their account (sets status → active in the webhook)
  const toNumber = normalizePhone(phone_number);
  try {
    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:                toNumber,
          type:              'template',
          template:          { name: 'optin_confirmation', language: { code: 'nl' } },
        }),
      },
    );

    if (!waRes.ok) {
      const body = await waRes.json();
      console.error('[whatsapp/optin] Template send failed:', body?.error?.message);
      // Do NOT surface Meta errors to the user — the DB row is already saved.
      // The UI says "check your WhatsApp" regardless.
    }
  } catch (err) {
    console.error('[whatsapp/optin] Fetch error sending template:', err.message);
  }

  console.log('[whatsapp/optin] Opt-in recorded for user', user.id, '→', toNumber);
  res.json({ success: true });
});

// ── WhatsApp disconnect ───────────────────────────────────────────────────────
// The Settings page calls Supabase directly (updates status → blocked) so
// no server endpoint is needed here — supabaseAdmin RLS handles it via the client.
// ── Process uploaded document (PDF text → AI summary) ────────────────────────
app.post('/api/process-document', async (req, res) => {
  const { text, filename } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'No text provided' });

  // Truncate to ~30k chars to stay well within token limits
  const excerpt = text.length > 30000 ? text.slice(0, 30000) + '\n\n[... document truncated ...]' : text;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for construction project management. The following is extracted text from a construction document: "${filename || 'uploaded document'}".

Extract the key information that would be useful as context for a site manager. Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

Document text:
${excerpt}

Return exactly this JSON:
{
  "title": "Short descriptive title (max 60 chars)",
  "summary": "2-4 sentence summary of what this document covers and its main purpose",
  "keyPoints": ["key obligation or fact 1", "key obligation or fact 2", "...up to 8 items"],
  "category": "contract or quote or note"
}

Rules:
- category "contract": specs, lastenboek, scope of work, technical requirements, contracts
- category "quote": price offers, estimates, bills of quantities, meetstaten, hoeveelheidsstaten
- category "note": meeting minutes, correspondence, general documents
- For spreadsheets/meetstaten: keyPoints should highlight the main work packages, total quantities, or cost totals — not individual line items`
      }]
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const data = JSON.parse(raw);
    logAIUsage('process-document', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('process-document error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Analyse context items → risk dashboard ───────────────────────────────────
app.post('/api/analyse-context', async (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.json({ success: true, data: { risks: [], obligations: [], watchPoints: [], budgetNotes: [], overallRisk: 'low', summary: 'No context items to analyse.' } });

  const formatted = items.map(i => {
    // Truncate individual item content so one large document doesn't crowd out others
    const content = i.content.length > 1500 ? i.content.slice(0, 1500) + ' [...]' : i.content;
    return `[${i.category.toUpperCase()}] ${i.title}: ${content}${i.source ? ` (source: ${i.source})` : ''}`;
  }).join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are an expert construction project risk analyst. Analyse the following project context items and identify risks, obligations, and watch points for the site manager.

CONTEXT ITEMS:
${formatted}

Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

{
  "overallRisk": "low|medium|high|critical",
  "summary": "2-3 sentence overall risk assessment for this project",
  "risks": [
    { "title": "Risk title", "detail": "What could go wrong and why", "severity": "low|medium|high|critical", "source": "which document/item this comes from" }
  ],
  "obligations": [
    { "title": "Obligation title", "detail": "What must be done", "source": "source item" }
  ],
  "watchPoints": [
    { "title": "Watch point title", "detail": "What to monitor closely" }
  ],
  "budgetNotes": [
    { "title": "Budget note", "detail": "Cost or quantity insight", "source": "source item" }
  ]
}

Rules:
- risks: things that could go wrong — safety, legal, financial, schedule. Max 8.
- obligations: things contractually or legally required. Max 8.
- watchPoints: grey areas or things to keep an eye on. Max 6.
- budgetNotes: cost estimates, quantities, financial exposure from quotes/meetstaten. Max 6.
- overallRisk: based on severity and number of risks found.
- Be specific and actionable, not generic.`
      }]
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const data = JSON.parse(raw);
    logAIUsage('analyse-context', 'claude-haiku-4-5-20251001', response.usage, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('analyse-context error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Admin middleware ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: 'Admin not configured' });
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

// ── Platform admin middleware — verifies JWT + platform_admins table ──────────
async function requirePlatformAdmin(req, res, next) {
  if (!supabaseAdmin) { console.error('[platformAdmin] supabaseAdmin is null'); return res.status(503).json({ success: false, error: 'Server not configured' }); }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { console.error('[platformAdmin] no token in Authorization header'); return res.status(401).json({ success: false, error: 'Unauthorized' }); }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) { console.error('[platformAdmin] getUser failed:', error?.message, '| user:', !!user); return res.status(401).json({ success: false, error: 'Unauthorized' }); }
  const { data: admin, error: adminErr } = await supabaseAdmin.from('platform_admins').select('id').eq('user_id', user.id).maybeSingle();
  if (!admin) { console.error('[platformAdmin] not in platform_admins. user_id:', user.id, '| err:', adminErr?.message); return res.status(403).json({ success: false, error: 'Forbidden' }); }
  next();
}

// ── User auth middleware — verifies Supabase JWT, attaches req.userId ─────────
async function requireUser(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Server not configured' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ success: false, error: 'Missing token' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
  req.userId = user.id;
  req.userEmail = user.email || null;
  next();
}

// Link any project_members rows that were created by email-only invite (user_id IS NULL)
// to the authenticated user's id. Called once per session to make RLS see the membership.
app.post('/api/auth/sync-memberships', requireUser, async (req, res) => {
  if (!req.userEmail) return res.json({ success: true, linked: 0 });
  const { data, error } = await supabaseAdmin
    .from('project_members')
    .update({ user_id: req.userId })
    .is('user_id', null)
    .eq('email', req.userEmail.toLowerCase())
    .select('id');
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, linked: data?.length || 0 });
});

// ── Project members (server-side, bypasses RLS) ───────────────────────────────

app.get('/api/projects/:projectId/members', requireUser, async (req, res) => {
  const { projectId } = req.params;
  // Verify caller has access to this project
  const { data: proj } = await supabaseAdmin.from('projects').select('owner_id').eq('id', projectId).single();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
  const { data: membership } = await supabaseAdmin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', req.userId).maybeSingle();
  if (proj.owner_id !== req.userId && !membership) return res.status(403).json({ success: false, error: 'Forbidden' });

  const { data, error } = await supabaseAdmin.from('project_members').select('id, email, role, whatsapp_phone').eq('project_id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

app.post('/api/projects/:projectId/members', requireUser, async (req, res) => {
  const { projectId } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });

  // Only project owner can add members
  const { data: proj } = await supabaseAdmin.from('projects').select('owner_id').eq('id', projectId).single();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
  if (proj.owner_id !== req.userId) return res.status(403).json({ success: false, error: 'Only the project owner can add members' });

  const cleanEmail = email.trim().toLowerCase();

  // Look up existing auth user so RLS policies (which match on user_id) work immediately.
  let resolvedUserId = null;
  try {
    for (let page = 1; page <= 10; page++) {
      const { data: ul } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const hit = (ul?.users || []).find(u => (u.email || '').toLowerCase() === cleanEmail);
      if (hit) { resolvedUserId = hit.id; break; }
      if (!ul?.users?.length || ul.users.length < 200) break;
    }
  } catch (e) { console.warn('member user_id lookup failed:', e.message); }

  const { data, error } = await supabaseAdmin.from('project_members')
    .insert({ project_id: projectId, email: cleanEmail, role: 'member', user_id: resolvedUserId })
    .select('id, email, role, whatsapp_phone').single();
  if (error) {
    const msg = error.code === '23505' ? 'Already a member.' : error.message;
    return res.status(400).json({ success: false, error: msg });
  }
  res.json({ success: true, data });
});

app.delete('/api/projects/:projectId/members/:memberId', requireUser, async (req, res) => {
  const { projectId, memberId } = req.params;
  const { data: proj } = await supabaseAdmin.from('projects').select('owner_id').eq('id', projectId).single();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
  if (proj.owner_id !== req.userId) return res.status(403).json({ success: false, error: 'Only the project owner can remove members' });

  const { error } = await supabaseAdmin.from('project_members').delete().eq('id', memberId).eq('project_id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

app.patch('/api/projects/:projectId/members/:memberId', requireUser, async (req, res) => {
  const { projectId, memberId } = req.params;
  const { whatsapp_phone } = req.body;
  const { data: proj } = await supabaseAdmin.from('projects').select('owner_id').eq('id', projectId).single();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
  if (proj.owner_id !== req.userId) return res.status(403).json({ success: false, error: 'Only the project owner can edit members' });

  const { error } = await supabaseAdmin.from('project_members')
    .update({ whatsapp_phone: whatsapp_phone?.trim() || null })
    .eq('id', memberId).eq('project_id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

// ── Admin: AI usage stats ─────────────────────────────────────────────────────
app.get('/api/admin/usage', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });

  const range = req.query.range || '30d';
  const rangeMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = rangeMap[range];

  try {
    let query = supabaseAdmin.from('ai_usage_logs').select('*').order('created_at', { ascending: false });
    if (days) {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      query = query.gte('created_at', since);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
    const totalCalls = rows.length;
    const totalInputTokens = rows.reduce((s, r) => s + (r.input_tokens || 0), 0);
    const totalOutputTokens = rows.reduce((s, r) => s + (r.output_tokens || 0), 0);

    // By model
    const modelMap = {};
    rows.forEach(r => {
      if (!modelMap[r.model]) modelMap[r.model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      modelMap[r.model].calls++;
      modelMap[r.model].inputTokens += r.input_tokens || 0;
      modelMap[r.model].outputTokens += r.output_tokens || 0;
      modelMap[r.model].cost += Number(r.cost_usd);
    });
    const byModel = Object.entries(modelMap).map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost);

    // By endpoint
    const endpointMap = {};
    rows.forEach(r => {
      if (!endpointMap[r.endpoint]) endpointMap[r.endpoint] = { calls: 0, cost: 0 };
      endpointMap[r.endpoint].calls++;
      endpointMap[r.endpoint].cost += Number(r.cost_usd);
    });
    const byEndpoint = Object.entries(endpointMap).map(([endpoint, v]) => ({ endpoint, ...v }))
      .sort((a, b) => b.cost - a.cost);

    // Daily breakdown (last N days or last 90 days for "all")
    const dailyDays = days || 90;
    const dailyMap = {};
    const now = new Date();
    for (let i = dailyDays - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, cost: 0, calls: 0 };
    }
    rows.forEach(r => {
      const key = r.created_at.slice(0, 10);
      if (dailyMap[key]) { dailyMap[key].cost += Number(r.cost_usd); dailyMap[key].calls++; }
    });
    const daily = Object.values(dailyMap);

    res.json({ success: true, data: { totalCost, totalCalls, totalInputTokens, totalOutputTokens, byModel, byEndpoint, daily } });
  } catch (err) {
    console.error('admin/usage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: account management ─────────────────────────────────────────────────
app.get('/api/admin/accounts', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });

  try {
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    if (usersErr) throw new Error(usersErr.message);

    const { data: projects, error: projErr } = await supabaseAdmin
      .from('projects').select('id, name, status, owner_id, created_at');
    if (projErr) throw new Error(projErr.message);

    const { data: logs, error: logsErr } = await supabaseAdmin
      .from('field_logs').select('project_id');
    if (logsErr) throw new Error(logsErr.message);

    // Count logs per project
    const logsPerProject = {};
    (logs || []).forEach(l => { logsPerProject[l.project_id] = (logsPerProject[l.project_id] || 0) + 1; });

    // Count projects per user
    const projectsPerUser = {};
    (projects || []).forEach(p => { projectsPerUser[p.owner_id] = (projectsPerUser[p.owner_id] || 0) + 1; });

    // User email lookup
    const userEmailMap = {};
    (users || []).forEach(u => { userEmailMap[u.id] = u.email; });

    const formattedUsers = (users || []).map(u => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      projectCount: projectsPerUser[u.id] || 0,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const formattedProjects = (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      ownerEmail: userEmailMap[p.owner_id] || p.owner_id,
      logCount: logsPerProject[p.id] || 0,
      createdAt: p.created_at,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: { users: formattedUsers, projects: formattedProjects } });
  } catch (err) {
    console.error('admin/accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: Project management ─────────────────────────────────────────────────

// List all projects with members embedded
app.get('/api/admin/projects', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const userEmailMap = {};
    (users || []).forEach(u => { userEmailMap[u.id] = u.email; });

    const { data: projects, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, status, owner_id, created_at, project_number, city, client_name, project_manager')
      .order('created_at', { ascending: false });
    if (projErr) throw new Error(projErr.message);

    const { data: members } = await supabaseAdmin.from('project_members').select('id, project_id, email, role');
    const membersByProject = {};
    (members || []).forEach(m => {
      if (!membersByProject[m.project_id]) membersByProject[m.project_id] = [];
      membersByProject[m.project_id].push({ id: m.id, email: m.email, role: m.role });
    });

    const formatted = (projects || []).map(p => ({
      id: p.id, name: p.name, status: p.status,
      ownerEmail: userEmailMap[p.owner_id] || null,
      ownerId: p.owner_id,
      projectNumber: p.project_number, city: p.city,
      clientName: p.client_name, projectManager: p.project_manager,
      createdAt: p.created_at,
      members: membersByProject[p.id] || [],
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a project (admin specifies owner by email)
app.post('/api/admin/projects', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });
  const { name, ownerEmail, status, projectNumber, city, clientName, projectManager, startDate, plannedCompletion, contractValue, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  if (!ownerEmail?.trim()) return res.status(400).json({ success: false, error: 'Owner email is required' });
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const owner = (users || []).find(u => u.email?.toLowerCase() === ownerEmail.trim().toLowerCase());
    if (!owner) return res.status(400).json({ success: false, error: `No registered user found with email: ${ownerEmail}` });

    const { data, error } = await supabaseAdmin.from('projects').insert({
      name: name.trim(), owner_id: owner.id,
      status: status || 'active',
      project_number: projectNumber?.trim() || null,
      city: city?.trim() || null,
      client_name: clientName?.trim() || null,
      project_manager: projectManager?.trim() || null,
      start_date: startDate || null,
      planned_completion: plannedCompletion || null,
      contract_value: contractValue ? parseFloat(contractValue) : null,
      description: description?.trim() || null,
    }).select().single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { ...data, ownerEmail: owner.email, members: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add member to a project (admin)
app.post('/api/admin/projects/:id/members', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  const { data, error } = await supabaseAdmin.from('project_members')
    .insert({ project_id: req.params.id, email: email.trim().toLowerCase(), role: role || 'member' })
    .select('id, email, role').single();
  if (error) {
    const msg = error.code === '23505' ? 'Already a member.' : error.message;
    return res.status(400).json({ success: false, error: msg });
  }
  res.json({ success: true, data });
});

// Update member role (admin)
app.patch('/api/admin/projects/:id/members/:memberId', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });
  const { role } = req.body;
  if (!role) return res.status(400).json({ success: false, error: 'Role required' });
  const { data, error } = await supabaseAdmin.from('project_members')
    .update({ role })
    .eq('id', req.params.memberId).eq('project_id', req.params.id)
    .select('id, email, role').single();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// Remove member from a project (admin)
app.delete('/api/admin/projects/:id/members/:memberId', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'supabaseAdmin not available' });
  const { error } = await supabaseAdmin.from('project_members')
    .delete().eq('id', req.params.memberId).eq('project_id', req.params.id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

// ── Backoffice routes (platform admin only) ───────────────────────────────────

app.get('/api/backoffice/stats', requirePlatformAdmin, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [companiesRes, projectsRes, usersRes, aiRes] = await Promise.all([
      supabaseAdmin.from('companies').select('id, status', { count: 'exact' }),
      supabaseAdmin.from('projects').select('id', { count: 'exact' }),
      supabaseAdmin.from('project_members').select('email').then(async (r) => {
        const memberEmails = new Set((r.data || []).map(m => m.email));
        const ownersRes = await supabaseAdmin.from('projects').select('owner_id');
        return { count: memberEmails.size + (ownersRes.data || []).length };
      }),
      supabaseAdmin.from('ai_usage_logs').select('id', { count: 'exact' }).gte('created_at', monthStart),
    ]);

    const activeCompanies = (companiesRes.data || []).filter(c => c.status === 'active').length;
    const runningProjects = projectsRes.count || 0;

    res.json({
      success: true,
      data: {
        activeCompanies,
        runningProjects,
        totalUsers: usersRes.count || 0,
        aiRequestsThisMonth: aiRes.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backoffice/companies', requirePlatformAdmin, async (req, res) => {
  try {
    const { search = '', status = 'all', page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin.from('companies').select('*', { count: 'exact' });
    if (status !== 'all') query = query.eq('status', status);
    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,vat_number.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
    }
    query = query.order('created_at', { ascending: false }).range(offset, offset + limitNum - 1);

    const { data: companies, count, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    const enriched = await Promise.all((companies || []).map(async (c) => {
      const [usersRes, projectsRes] = await Promise.all([
        supabaseAdmin.from('company_users').select('id', { count: 'exact' }).eq('company_id', c.id),
        supabaseAdmin.from('projects').select('id', { count: 'exact' }).eq('company_id', c.id),
      ]);
      return { ...c, userCount: usersRes.count || 0, activeProjects: projectsRes.count || 0 };
    }));

    res.json({ success: true, data: enriched, total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backoffice/companies', requirePlatformAdmin, async (req, res) => {
  const { name, vat_number, email, phone, address_street, address_zip, address_city, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Bedrijfsnaam is verplicht' });
  if (!email?.trim()) return res.status(400).json({ success: false, error: 'E-mail is verplicht' });
  const { data, error } = await supabaseAdmin.from('companies').insert({
    name: name.trim(), vat_number: vat_number?.trim() || null, email: email.trim().toLowerCase(),
    phone: phone?.trim() || null, address_street: address_street?.trim() || null,
    address_zip: address_zip?.trim() || null, address_city: address_city?.trim() || null,
    notes: notes?.trim() || null, status: 'active',
  }).select().single();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

app.get('/api/backoffice/companies/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [companyRes, usersRes, projectsRes] = await Promise.all([
      supabaseAdmin.from('companies').select('*').eq('id', id).single(),
      supabaseAdmin.from('company_users').select('*').eq('company_id', id).order('invited_at', { ascending: false }),
      supabaseAdmin.from('projects').select('id, name, city, status, created_at').eq('company_id', id).order('created_at', { ascending: false }),
    ]);
    if (companyRes.error) return res.status(404).json({ success: false, error: 'Bedrijf niet gevonden' });

    const projectsWithLogs = await Promise.all((projectsRes.data || []).map(async (p) => {
      const { count } = await supabaseAdmin.from('field_logs').select('id', { count: 'exact' }).eq('project_id', p.id);
      return { ...p, logCount: count || 0 };
    }));

    res.json({ success: true, data: { company: companyRes.data, users: usersRes.data || [], projects: projectsWithLogs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/backoffice/companies/:id', requirePlatformAdmin, async (req, res) => {
  const { id } = req.params;
  const fields = ['name', 'vat_number', 'email', 'phone', 'address_street', 'address_zip', 'address_city', 'notes', 'status'];
  const updates = { updated_at: new Date().toISOString() };
  fields.forEach(f => { if (f in req.body) updates[f] = req.body[f]; });
  const { data, error } = await supabaseAdmin.from('companies').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

app.post('/api/backoffice/companies/:id/users', requirePlatformAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, role = 'member' } = req.body;
  if (!email?.trim()) return res.status(400).json({ success: false, error: 'E-mail is verplicht' });

  if (role === 'admin') {
    const { count } = await supabaseAdmin.from('company_users').select('id', { count: 'exact', head: true }).eq('company_id', id).eq('role', 'admin');
    if (count > 0) return res.status(400).json({ success: false, error: 'Dit bedrijf heeft al een beheerder. Verwijder de huidige beheerder voor je een nieuwe toevoegt.' });
  }

  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = (users || []).find(u => u.email?.toLowerCase() === email.trim().toLowerCase());

  const { data, error } = await supabaseAdmin.from('company_users').insert({
    company_id: id,
    user_id: existingUser?.id || null,
    email: email.trim().toLowerCase(),
    role,
    accepted_at: existingUser ? new Date().toISOString() : null,
  }).select().single();

  if (error) {
    const msg = error.code === '23505' ? 'Gebruiker al gekoppeld aan dit bedrijf.' : error.message;
    return res.status(400).json({ success: false, error: msg });
  }
  res.json({ success: true, data });
});

app.delete('/api/backoffice/companies/:id/users/:userEmail', requirePlatformAdmin, async (req, res) => {
  const { id, userEmail } = req.params;
  const { error } = await supabaseAdmin.from('company_users')
    .delete().eq('company_id', id).eq('email', decodeURIComponent(userEmail));
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

app.get('/api/backoffice/unlinked-projects', requirePlatformAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('projects')
    .select('id, name, city, status').is('company_id', null).order('name');
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: data || [] });
});

app.post('/api/backoffice/companies/:id/projects', requirePlatformAdmin, async (req, res) => {
  const { id } = req.params;
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ success: false, error: 'projectId is verplicht' });
  const { data, error } = await supabaseAdmin.from('projects')
    .update({ company_id: id }).eq('id', projectId).select('id, name, city, status').single();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

app.delete('/api/backoffice/companies/:id/projects/:projectId', requirePlatformAdmin, async (req, res) => {
  const { projectId } = req.params;
  const { error } = await supabaseAdmin.from('projects').update({ company_id: null }).eq('id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

// ── MEERWERK classification ───────────────────────────────────────────────────
app.post('/api/classify-meerwerk', (req, res) => classifyMeerwerkHandler(req, res));

// ── Memo processing (extraction + classification + recommended outputs) ───────
app.post('/api/process-log', (req, res) => processLogHandler(req, res));

// ── AI second-pass triage of the inbox ────────────────────────────────────────
app.post('/api/triage-inbox', (req, res) => triageInboxHandler(req, res));
app.post('/api/merge-emails', (req, res) => mergeEmailsHandler(req, res));
app.post('/api/chat',         (req, res) => chatHandler(req, res));

// ── Admin (internal Punchlister staff dashboard) ──────────────────────────────
// These match the Vercel file-based routes that the Admin.jsx frontend calls.
app.all('/api/admin-usage',           (req, res) => adminUsageHandler(req, res));
app.all('/api/admin-accounts',        (req, res) => adminAccountsHandler(req, res));
app.all('/api/admin-projects',        (req, res) => adminProjectsHandler(req, res));
app.all('/api/admin-project-members', (req, res) => adminProjectMembersHandler(req, res));

// ── Outbound email send ───────────────────────────────────────────────────────
app.post('/api/send-email', (req, res) => sendEmailHandler(req, res));

// ── Project contacts CRUD ─────────────────────────────────────────────────────
app.all('/api/project-contacts', (req, res) => projectContactsHandler(req, res));

// ── Project Q&A chat ──────────────────────────────────────────────────────────
app.post('/api/project-chat', (req, res) => projectChatHandler(req, res));

// ── Reminders CRUD ────────────────────────────────────────────────────────────
app.all('/api/reminders', (req, res) => remindersHandler(req, res));

// ── Dispute flow endpoints ────────────────────────────────────────────────────
app.post('/api/reconstruct-timeline',    (req, res) => reconstructTimelineHandler(req, res));
app.post('/api/generate-gap-questions',  (req, res) => generateGapQuestionsHandler(req, res));
app.post('/api/collect-evidence',        (req, res) => collectEvidenceHandler(req, res));
app.post('/api/generate-draft-response', (req, res) => generateDraftResponseHandler(req, res));
app.post('/api/generate-dispute-dossier',(req, res) => generateDisputeDossierHandler(req, res));
app.post('/api/send-dispute-response',  (req, res) => sendDisputeResponseHandler(req, res));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeySet: !!process.env.ANTHROPIC_API_KEY,
    telegramActive: !!process.env.TELEGRAM_BOT_TOKEN,
    whisperActive: !!process.env.GROQ_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// ── Telegram Bot ──────────────────────────────────────────────────────────────
if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  // Whitelist: comma-separated chat IDs in env. Empty = allow all (not recommended)
  const ALLOWED_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS
    ? process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(',').map(s => s.trim())
    : [];

  // Per-chat active project (in-memory; resets on server restart — use BOT_DEFAULT_PROJECT_ID for persistence)
  const chatProjectMap = {};

  const isAllowed = (chatId) =>
    !ALLOWED_IDS.length || ALLOWED_IDS.includes(String(chatId));

  const typeEmoji   = { delay: '⏰', safety: '⚠️', progress: '✅', material: '📦', rfi: '📋', general: '📝' };
  const impactEmoji = { none: '🟢', schedule: '🟡', cost: '🟠', safety: '🔴' };

  function buildReply(transcript, data) {
    const lines = [
      `${typeEmoji[data.type] || '📝'} *Field note saved*`,
      ``,
      `📣 *Note:* ${transcript}`,
      ``,
      `*Summary:* ${data.summary}`,
      `*Type:* ${data.type.toUpperCase()}`,
      `*Impact:* ${impactEmoji[data.impact] || ''} ${data.impact}`,
    ];
    if (data.flags?.length)   lines.push(`*Tags:* ${data.flags.join(' · ')}`);
    if (data.actionRequired)  lines.push(`⚠️ *Action required*`);
    if (data.suggestRFI)      lines.push(`📋 *RFI suggested — open the app to draft*`);
    return lines.join('\n');
  }

  async function handleFieldNote(chatId, rawNote, location = '') {
    const projectId = chatProjectMap[chatId] || process.env.BOT_DEFAULT_PROJECT_ID;

    // Project is only required when Supabase is active (needed for DB insert)
    if (!projectId && supabaseAdmin) {
      await bot.sendMessage(chatId, '⚠️ No project set. Use `/setproject ProjectName` to pick one.', { parse_mode: 'Markdown' });
      return;
    }

    // Try AI processing; fall back to saving raw note if API is unavailable
    let data = null;
    try {
      data = await processNote(rawNote, location, [], { projectId, source: 'telegram' });
    } catch (err) {
      console.warn('AI processing failed, saving raw note:', err.message);
    }

    const fallback = !data;
    if (fallback) {
      data = { summary: rawNote, type: 'general', flags: [], impact: 'none', actionRequired: false, suggestRFI: false };
    }

    try {
      if (supabaseAdmin && projectId) {
        const { error } = await supabaseAdmin.from('field_logs').insert({
          project_id: projectId,
          raw_note: rawNote,
          location: location || null,
          processed_summary: fallback ? null : data.summary,
          type: data.type,
          flags: data.flags,
          impact: data.impact,
          action_required: data.actionRequired,
          suggest_rfi: data.suggestRFI,
          processing: fallback,
        });
        if (error) throw new Error(`DB: ${error.message}`);
      }

      const reply = fallback
        ? `📝 *Note saved* _(AI unavailable — will process later)_\n\n📣 *Note:* ${rawNote}`
        : buildReply(rawNote, data);
      await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('handleFieldNote error:', err.message);
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
  }

  // /start
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `👷 *Punchlister Bot*\n\nSend a voice message or text to log a field note.\n\n*Commands:*\n\`/setproject <name>\` — set active project\n\`/project\` — show active project\n\`/help\` — show this message`,
      { parse_mode: 'Markdown' }
    );
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `*Commands:*\n\`/setproject <name>\` — set active project\n\`/project\` — show active project\n\nOr just send a voice message or text note.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /project — show current active project
  bot.onText(/\/project$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const projectId = chatProjectMap[chatId] || process.env.BOT_DEFAULT_PROJECT_ID;
    if (!projectId) return bot.sendMessage(chatId, 'No project set. Use `/setproject <name>`.');

    if (!supabaseAdmin) return bot.sendMessage(chatId, `Active project ID: \`${projectId}\``);

    const { data } = await supabaseAdmin.from('projects').select('name').eq('id', projectId).single();
    bot.sendMessage(chatId, `Active project: *${data?.name || projectId}*`, { parse_mode: 'Markdown' });
  });

  // /setproject <name> — search and activate a project
  bot.onText(/\/setproject (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const search = match[1].trim();

    // No Supabase — store the name directly in memory
    if (!supabaseAdmin) {
      chatProjectMap[chatId] = search;
      return bot.sendMessage(chatId, `✅ Active project set to: *${search}*`, { parse_mode: 'Markdown' });
    }
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .ilike('name', `%${search}%`)
      .limit(5);

    if (error) return bot.sendMessage(chatId, `❌ ${error.message}`);
    if (!projects?.length) return bot.sendMessage(chatId, `❌ No project found matching "${search}"`);

    if (projects.length === 1) {
      chatProjectMap[chatId] = projects[0].id;
      return bot.sendMessage(chatId, `✅ Active project set to: *${projects[0].name}*`, { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId,
      `Multiple matches — be more specific:\n${projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}`
    );
  });

  // Voice message → Whisper → field note
  bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    if (!openai) {
      return bot.sendMessage(chatId, '⚠️ GROQ_API_KEY not set — voice transcription unavailable. Send a text note instead.');
    }

    const status = await bot.sendMessage(chatId, '🎙 Transcribing...');

    try {
      const fileInfo = await bot.getFile(msg.voice.file_id);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      const audioRes = await fetch(fileUrl);
      const tmpPath  = path.join(__dirname, `tmp_voice_${Date.now()}.ogg`);
      fs.writeFileSync(tmpPath, Buffer.from(await audioRes.arrayBuffer()));

      const { text: transcript } = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: 'whisper-large-v3-turbo',
      });

      fs.unlinkSync(tmpPath);

      await bot.editMessageText(
        `📝 _"${transcript}"_\n⚙️ Processing...`,
        { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
      );

      await handleFieldNote(chatId, transcript);
    } catch (err) {
      console.error('voice handler error:', err.status, err.message, err.error ?? '');
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
  });

  // Text message → field note (skip commands)
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || msg.voice) return;
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    await bot.sendMessage(chatId, '⚙️ Processing...');
    await handleFieldNote(chatId, msg.text);
  });

  console.log('🤖 Telegram bot active (polling)');
} else {
  console.log('ℹ️  TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
}

// ── WhatsApp helpers ───────────────────────────────────────────────────────────

// Send a text reply back to a WhatsApp sender.
// Requires WHATSAPP_PHONE_NUMBER_ID (the numeric ID from Meta Developer Portal → WhatsApp → API Setup).
async function sendWhatsAppReply(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    });
  } catch (err) {
    console.warn('WhatsApp reply failed:', err.message);
  }
}

// Resolve which project a WhatsApp sender's messages should be routed to.
// Priority: active session (wa_sender_state) → phone mapping (project_members) → env default
async function resolveWhatsAppProject(from) {
  if (!supabaseAdmin) return process.env.WHATSAPP_DEFAULT_PROJECT_ID || null;

  const { data: state } = await supabaseAdmin
    .from('wa_sender_state')
    .select('project_id')
    .eq('phone_number', from)
    .maybeSingle();
  if (state?.project_id) return state.project_id;

  const { data: member } = await supabaseAdmin
    .from('project_members')
    .select('project_id')
    .eq('whatsapp_phone', from)
    .maybeSingle();
  if (member?.project_id) return member.project_id;

  return process.env.WHATSAPP_DEFAULT_PROJECT_ID || null;
}

// Detect whether a message is a field note, a status query, or a help request.
// Uses Claude Haiku so natural language works for both text and voice.
async function detectWhatsAppIntent(text) {
  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      system: `Today is ${today}. You classify construction site WhatsApp messages. Respond ONLY with valid JSON, no markdown.`,
      messages: [{
        role: 'user',
        content: `Classify this message into one of three intents:
1. "field_note"    — the user is reporting something they observed on site
2. "status_report" — the user is asking for a summary/overview/rapport of recent activity
3. "help"          — the user is asking what commands are available

Message: "${text.replace(/"/g, "'")}"

If "status_report", extract the time period (default 7 days if unspecified).
Examples: "gisteren"→daysBack:1, "vandaag"→daysBack:1, "deze week"→daysBack:7, "laatste 3 dagen"→daysBack:3, "deze maand"→daysBack:30

Return exactly one of:
{"type":"field_note"}
{"type":"status_report","daysBack":7,"periodLabel":"laatste 7 dagen"}
{"type":"help"}`,
      }],
    });
    return JSON.parse(res.content[0].text);
  } catch {
    return { type: 'field_note' }; // safe fallback: treat as field note
  }
}

// Parse project-switch commands (still exact-match, no AI needed).
function parseWaCommand(text) {
  const t = text.trim().toLowerCase();
  if (/^(my\s+)?projects?(\s+list)?$|^list(\s+projects?)?$/.test(t)) return { command: 'list' };
  const m = t.match(/^(?:project|switch(?:\s+to)?|use(?:\s+project)?|set(?:\s+project)?)\s+(.+)$/);
  if (m) return { command: 'switch', query: m[1].trim() };
  return { command: null };
}

// Send a formatted status report for a project back to a WhatsApp sender.
async function sendWhatsAppStatusReport(from, projectId, daysBack = 7, periodLabel = 'laatste 7 dagen') {
  if (!supabaseAdmin) {
    await sendWhatsAppReply(from, 'Service unavailable.');
    return;
  }

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('name, project_number')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) {
    await sendWhatsAppReply(from, 'Geen actief project gevonden. Typ *project [naam]* om er één in te stellen.');
    return;
  }

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabaseAdmin
    .from('field_logs')
    .select('id, type, flags, impact, action_required, suggest_rfi, processed_summary, raw_note, created_at')
    .eq('project_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  const total = logs?.length || 0;
  const projectLabel = project.project_number
    ? `${project.name} (#${project.project_number})`
    : project.name;

  if (total === 0) {
    await sendWhatsAppReply(from, `📊 *Status: ${projectLabel}*\n_${periodLabel}_\n\nGeen activiteit gevonden.`);
    return;
  }

  const typeCounts = {};
  const typeEmoji  = { delay: '🕐', safety: '⚠️', progress: '✅', material: '📦', rfi: '❓', general: '📝' };
  for (const log of logs) {
    const t = log.type || 'general';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const actionItems = logs.filter(l => l.action_required);
  const rfiItems    = logs.filter(l => l.suggest_rfi);

  const lines = [
    `📊 *Status: ${projectLabel}*`,
    `_${periodLabel}_`,
    '',
    `📋 *${total} melding${total !== 1 ? 'en' : ''}*`,
  ];

  const typeOrder = ['safety', 'delay', 'rfi', 'progress', 'material', 'general'];
  for (const t of typeOrder) {
    if (typeCounts[t]) {
      const label = t.charAt(0).toUpperCase() + t.slice(1);
      lines.push(`${typeEmoji[t] || '📝'} ${label}: ${typeCounts[t]}`);
    }
  }

  // Action items
  if (actionItems.length) {
    lines.push('', `⚠️ *${actionItems.length} actie${actionItems.length !== 1 ? 's' : ''} vereist:*`);
    for (const log of actionItems.slice(0, 3)) {
      const summary = log.processed_summary || log.raw_note || '';
      lines.push(`• ${summary.slice(0, 80)}${summary.length > 80 ? '…' : ''}`);
    }
    if (actionItems.length > 3) lines.push(`  … en ${actionItems.length - 3} meer`);
  }

  // RFI suggestions
  if (rfiItems.length) {
    lines.push('', `📋 *${rfiItems.length} RFI${rfiItems.length !== 1 ? '\'s' : ''} voorgesteld* — open de app om te starten`);
  }

  // Latest 3 logs
  lines.push('', `🕓 *Laatste meldingen:*`);
  for (const log of logs.slice(0, 3)) {
    const summary = log.processed_summary || log.raw_note || '';
    const date = new Date(log.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
    lines.push(`• [${date}] ${summary.slice(0, 70)}${summary.length > 70 ? '…' : ''}`);
  }

  await sendWhatsAppReply(from, lines.join('\n'));
}

// ── WhatsApp Webhook ───────────────────────────────────────────────────────────

// Verification handshake — Meta calls this once when you register the webhook
app.get('/webhook/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Unified incoming message handler — text commands + voice notes → field_logs
app.post('/webhook/whatsapp', async (req, res) => {
  // Acknowledge immediately — Meta retries if you don't respond within 20 s
  res.sendStatus(200);

  try {
    const entry  = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== 'messages') return;

    const value    = change.value;
    const messages = value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return;

    for (const msg of messages) {
      const from    = msg.from;   // sender's phone number (E.164, no +)
      const msgId   = msg.id;
      const type    = msg.type;
      const body    = msg.text?.body ?? null;
      const display = value?.metadata?.display_phone_number;

      console.log(`WhatsApp message from ${from}: ${body ?? `[${type}]`}`);

      // Resolve project for this sender (used by both logger and voice-note handler)
      const projectId = await resolveWhatsAppProject(from);

      // Log every message to whatsapp_messages for audit / admin view
      if (supabaseAdmin) {
        supabaseAdmin.from('whatsapp_messages').insert({
          from_number:          from,
          display_phone_number: display ?? null,
          message_id:           msgId,
          message_type:         type,
          body,
          raw:                  req.body,
          project_id:           projectId,
        }).then(({ error }) => { if (error) console.warn('whatsapp_messages insert:', error.message); });
      }

      // ── Text messages ─────────────────────────────────────────────────────
      if (type === 'text' && body) {
        // Check for pending follow-up question first (takes priority over commands)
        if (supabaseAdmin) {
          const { data: senderState } = await supabaseAdmin
            .from('wa_sender_state')
            .select('pending_question, pending_log_id')
            .eq('phone_number', from)
            .maybeSingle();

          if (senderState?.pending_question === 'location') {
            const isSkip = /^skip$/i.test(body.trim());
            const location = isSkip ? null : body.trim();

            // Clear pending state regardless
            await supabaseAdmin.from('wa_sender_state')
              .update({ pending_question: null, pending_log_id: null })
              .eq('phone_number', from);

            if (!isSkip && senderState.pending_log_id && location) {
              await supabaseAdmin.from('field_logs')
                .update({ location })
                .eq('id', senderState.pending_log_id);
              await sendWhatsAppReply(from, `📍 Location saved: *${location}*`);
            } else {
              await sendWhatsAppReply(from, 'OK, location left blank.');
            }
            continue;
          }
        }

        // Try exact-match project commands first (no AI cost)
        const { command, query } = parseWaCommand(body);

        if (command === 'list') {
          if (!supabaseAdmin) { await sendWhatsAppReply(from, 'Service unavailable.'); continue; }
          const { data: rows } = await supabaseAdmin
            .from('project_members')
            .select('project_id, projects(name, project_number)')
            .eq('whatsapp_phone', from);
          if (!rows?.length) {
            await sendWhatsAppReply(from,
              'No projects are linked to this number yet.\nAsk your PM to add your WhatsApp number in Project Settings.'
            );
          } else {
            const lines = rows.map(r =>
              `• ${r.projects.name}${r.projects.project_number ? ` (#${r.projects.project_number})` : ''}`
            );
            await sendWhatsAppReply(from, `Your projects:\n${lines.join('\n')}`);
          }
          continue;
        }

        if (command === 'switch') {
          if (!supabaseAdmin) { await sendWhatsAppReply(from, 'Service unavailable.'); continue; }
          const { data: matches } = await supabaseAdmin
            .from('projects')
            .select('id, name, project_number')
            .or(`name.ilike.%${query}%,project_number.ilike.%${query}%`)
            .limit(1);
          if (!matches?.length) {
            await sendWhatsAppReply(from, `No project found matching "${query}".\nType *projects* to see your list.`);
            continue;
          }
          const p = matches[0];
          await supabaseAdmin.from('wa_sender_state').upsert(
            { phone_number: from, project_id: p.id, updated_at: new Date().toISOString() },
            { onConflict: 'phone_number' }
          );
          await sendWhatsAppReply(from,
            `Switched to *${p.name}*${p.project_number ? ` (#${p.project_number})` : ''}.\nYour voice notes will now be logged there.`
          );
          continue;
        }

        // Unrecognised exact command — use AI to detect intent (status query, help, or field note)
        const intent = await detectWhatsAppIntent(body);
        console.log(`WhatsApp intent from ${from}:`, JSON.stringify(intent));

        if (intent.type === 'help') {
          await sendWhatsAppReply(from,
            'Punchlister commando\'s:\n' +
            '• *status* — statusrapport van je project\n' +
            '• *project [naam]* — wissel van project\n' +
            '• *projects* — toon je projecten\n' +
            'Of stuur een spraakbericht om een melding te loggen.'
          );
          continue;
        }

        if (intent.type === 'status_report') {
          if (!projectId) {
            await sendWhatsAppReply(from, 'Geen actief project. Typ *project [naam]* om er één in te stellen.');
          } else {
            await sendWhatsAppStatusReport(from, projectId, intent.daysBack || 7, intent.periodLabel || 'laatste 7 dagen');
          }
          continue;
        }

        // intent === 'field_note' → ignore text field notes silently (only voice is logged)
        continue;
      }

      // ── Voice notes ────────────────────────────────────────────────────────
      if (type === 'audio') {
        if (!openai) {
          console.warn('WhatsApp voice note received but GROQ_API_KEY not set — skipping');
          continue;
        }

        const mediaId = msg.audio?.id;
        if (!mediaId) continue;

        console.log(`WhatsApp voice note from ${from} → project ${projectId}, media_id=${mediaId}`);

        // 1. Get download URL from Meta Graph API
        const metaUrlRes  = await fetch(
          `https://graph.facebook.com/v19.0/${mediaId}`,
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
        );
        const metaUrlJson = await metaUrlRes.json();
        const audioUrl    = metaUrlJson?.url;
        if (!audioUrl) { console.error('WhatsApp: could not get media URL', metaUrlJson); continue; }

        // 2. Download audio
        const audioRes = await fetch(audioUrl, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
        });
        const tmpPath = path.join(__dirname, `tmp_wa_${Date.now()}.ogg`);
        fs.writeFileSync(tmpPath, Buffer.from(await audioRes.arrayBuffer()));

        // 3. Transcribe with Whisper
        let transcript;
        try {
          const result = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tmpPath),
            model: 'whisper-large-v3-turbo',
          });
          transcript = result.text;
        } finally {
          fs.unlinkSync(tmpPath);
        }
        console.log(`WhatsApp transcript from ${from}: "${transcript}"`);

        // 3b. Check intent — voice note might be a status query, not a field note
        const voiceIntent = await detectWhatsAppIntent(transcript);
        console.log(`WhatsApp voice intent from ${from}:`, JSON.stringify(voiceIntent));

        if (voiceIntent.type === 'status_report') {
          if (!projectId) {
            await sendWhatsAppReply(from, 'Geen actief project. Typ *project [naam]* om er één in te stellen.');
          } else {
            await sendWhatsAppStatusReport(from, projectId, voiceIntent.daysBack || 7, voiceIntent.periodLabel || 'laatste 7 dagen');
          }
          continue;
        }

        if (voiceIntent.type === 'help') {
          await sendWhatsAppReply(from,
            'Punchlister commando\'s:\n• *status* — statusrapport\nOf stuur een spraakbericht om een melding te loggen.'
          );
          continue;
        }

        // voiceIntent === 'field_note' → proceed with normal logging below

        // 4. Fetch project labels for richer AI categorisation
        let labels = [];
        if (supabaseAdmin && projectId) {
          const { data: ldata } = await supabaseAdmin
            .from('project_labels')
            .select('name')
            .eq('project_id', projectId);
          labels = ldata || [];
        }

        // 5. Process through Claude
        let data = null;
        try {
          data = await processNote(transcript, '', labels, { projectId, source: 'whatsapp' });
        } catch (err) {
          console.warn('WhatsApp: AI processing failed, saving raw note:', err.message);
        }
        const fallback = !data;
        if (fallback) {
          data = { summary: transcript, type: 'general', flags: [], impact: 'none', actionRequired: false, suggestRFI: false };
        }

        // 6. Save to field_logs
        if (supabaseAdmin && projectId) {
          const extractedLocation = data.extractedLocation || null;
          const { data: savedLog, error } = await supabaseAdmin.from('field_logs').insert({
            project_id:        projectId,
            raw_note:          transcript,
            location:          extractedLocation,
            processed_summary: fallback ? null : data.summary,
            type:              data.type,
            flags:             data.flags,
            impact:            data.impact,
            action_required:   data.actionRequired,
            suggest_rfi:       data.suggestRFI,
            processing:        fallback,
          }).select('id').single();

          if (error) {
            console.error('WhatsApp: DB insert error:', error.message);
          } else {
            console.log(`WhatsApp: field log saved for project ${projectId}`);

            // 7. Send confirmation reply
            const typeEmoji  = { delay: '🕐', safety: '⚠️', progress: '✅', material: '📦', rfi: '❓', general: '📝' };
            const impactLine = { schedule: '📅 Schedule impact', cost: '💰 Cost impact', safety: '🚨 Safety impact' };
            const typeLabel  = (data.type || 'general').charAt(0).toUpperCase() + (data.type || 'general').slice(1);

            const lines = [
              `${typeEmoji[data.type] || '📝'} *${typeLabel}* logged`,
              '',
              data.summary || transcript.slice(0, 120),
            ];
            if (extractedLocation)       lines.push(`📍 ${extractedLocation}`);
            if (data.flags?.length)      lines.push(`🏷 ${data.flags.join(' · ')}`);
            if (impactLine[data.impact]) lines.push(impactLine[data.impact]);
            if (data.actionRequired)     lines.push('⚠️ Action required');
            if (data.suggestRFI)         lines.push('📋 RFI suggested — open the app to draft');

            const needsLocation = !extractedLocation;
            if (needsLocation) {
              lines.push('', '📍 Where did this happen? Reply with the location, or "skip".');
            }

            await sendWhatsAppReply(from, lines.join('\n'));

            // 8. Store pending state so the location reply is captured
            if (needsLocation && savedLog?.id) {
              await supabaseAdmin.from('wa_sender_state').upsert(
                {
                  phone_number:     from,
                  project_id:       projectId,
                  pending_question: 'location',
                  pending_log_id:   savedLog.id,
                  updated_at:       new Date().toISOString(),
                },
                { onConflict: 'phone_number' }
              );
            }
          }
        } else if (!projectId) {
          await sendWhatsAppReply(from,
            'Note received but no project is set for this number.\nText *project [name]* to assign one.'
          );
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message);
  }
});


// ── Cross-project AI chat ─────────────────────────────────────────────────────
app.post('/api/cross-project-chat', async (req, res) => {
  const { message, history = [], userId } = req.body;
  if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });
  if (!userId)          return res.status(400).json({ success: false, error: 'userId required' });
  if (!supabaseAdmin)   return res.status(503).json({ success: false, error: 'Server not configured' });

  try {
    const { data: projects = [] } = await supabaseAdmin
      .from('projects')
      .select('id, name, status, client_name, project_manager, planned_completion')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!projects.length) {
      return res.json({ success: true, response: 'Je hebt nog geen projecten aangemaakt. Maak een project aan om te starten.', sources: [] });
    }

    const ids = projects.map(p => p.id);
    const nameMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

    const [logsRes, dispRes, punchRes] = await Promise.all([
      supabaseAdmin.from('field_logs')
        .select('project_id, processed_summary, raw_note, log_date, created_at, type')
        .in('project_id', ids).order('created_at', { ascending: false }).limit(40),
      supabaseAdmin.from('disputes')
        .select('project_id, subject, sender_email, status, created_at')
        .in('project_id', ids).limit(20),
      supabaseAdmin.from('punch_items')
        .select('project_id, task, assignee, priority, due_date')
        .in('project_id', ids).eq('status', 'pending').limit(40),
    ]);

    const fmt   = (iso) => iso ? iso.split('T')[0] : '';
    const trunc = (s, n) => s ? (s.length > n ? s.slice(0, n) + '…' : s) : '';

    const sections = [
      '## Projecten\n' + projects.map(p =>
        `- ${p.name} [${p.status}]${p.client_name ? `, bouwheer: ${p.client_name}` : ''}${p.planned_completion ? `, gepland einde: ${p.planned_completion}` : ''}`
      ).join('\n'),
    ];

    const logs = logsRes.data || [];
    if (logs.length) sections.push(
      '## Werfverslagen\n' + logs.map(l =>
        `[${nameMap[l.project_id]}] ${fmt(l.log_date || l.created_at)}: ${trunc(l.processed_summary || l.raw_note, 180)}`
      ).join('\n')
    );

    const disp = dispRes.data || [];
    if (disp.length) sections.push(
      '## Betwistingen\n' + disp.map(d =>
        `[${nameMap[d.project_id]}] ${d.subject || d.sender_email} (${d.status}, ${fmt(d.created_at)})`
      ).join('\n')
    );

    const punch = punchRes.data || [];
    if (punch.length) sections.push(
      '## Openstaande taken\n' + punch.map(p =>
        `[${nameMap[p.project_id]}] ${p.task}${p.assignee ? ` → ${p.assignee}` : ''}${p.due_date ? ` (deadline: ${p.due_date})` : ''}`
      ).join('\n')
    );

    const system = `Je bent Punchlister AI, assistent voor bouwprojectbeheer. Beantwoord vragen over de projectdata hieronder in het Nederlands. Wees beknopt en concreet. Verwijs naar projecten bij naam. Geef aan als informatie ontbreekt.

${sections.join('\n\n')}

Sluit je antwoord af met een bronnenlijst op een aparte nieuwe regel (enkel als je projecten hebt geciteerd):
[SOURCES: [{"project":"ProjectNaam","count":N}]]`;

    const aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system,
      messages: [
        ...(history || []).slice(-6).map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ],
    });

    logAIUsage('cross-project-chat', 'claude-haiku-4-5-20251001', aiRes.usage, null, { userId });

    const raw   = aiRes.content[0].text.trim();
    const match = raw.match(/\[SOURCES:\s*(\[[\s\S]*?\])\]/);
    let sources = [], text = raw;

    if (match) {
      try { sources = JSON.parse(match[1]); } catch {}
      text = raw.replace(match[0], '').trim();
    }

    res.json({ success: true, response: text, sources });
  } catch (err) {
    console.error('cross-project-chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🏗  Punchlister API server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY not set — AI features will fail. Copy .env.example to .env and add your key.\n');
  } else {
    console.log('✓  Anthropic API key loaded\n');
  }
});
