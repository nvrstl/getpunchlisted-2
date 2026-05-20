import fs from 'fs';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const openai = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const TYPE_EMOJI = { delay: '🕐', safety: '⚠️', progress: '✅', material: '📦', rfi: '❓', general: '📝' };

const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

async function logAIUsage(endpoint, model, usage, projectId = null, metadata = {}) {
  if (!supabaseAdmin || !usage) return;
  try {
    const pricing = MODEL_PRICING[model] || { input: 1.00, output: 5.00 };
    const costUsd = (usage.input_tokens * pricing.input + usage.output_tokens * pricing.output) / 1_000_000;
    await supabaseAdmin.from('ai_usage_logs').insert({
      endpoint, model,
      input_tokens:  usage.input_tokens  || 0,
      output_tokens: usage.output_tokens || 0,
      cost_usd:      costUsd,
      project_id:    projectId || null,
      metadata:      Object.keys(metadata).length ? metadata : null,
    });
  } catch (err) { console.warn('logAIUsage failed:', err.message); }
}

async function processNote(note, location = '', _labels = [], { projectId = null, source = 'api', attempt = 0 } = {}) {
  const labelSection = `\n- label: generate ONE short Dutch tag (1-2 words, no punctuation) covering the main topic — e.g. "Beton", "Elektriciteit", "Loodgieterij", "HVAC", "Schrijnwerk", "Schilderwerk", "Dakwerken", "Veiligheid", "Planning", "Coördinatie", "Materiaal", "Meerwerk", "Oplevering". Use consistent terms across memos.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `You are an AI assistant for a Belgian construction project manager. Process this site-visit memo and extract structured data. Return ONLY valid JSON — no markdown, no code blocks, just raw JSON.

Note: "${note}"
Provided Location: "${location || ''}"

Return exactly this JSON structure:
{
  "summary": "1-2 sentence professional summary in Dutch",
  "type": "delay|safety|progress|material|rfi|general",
  "flags": ["short tag 1", "short tag 2"],
  "impact": "none|schedule|cost|safety",
  "actionRequired": true or false,
  "suggestRFI": true or false,
  "extractedLocation": null or "location string found in the note",
  "extractedDate": null or "YYYY-MM-DD date found in the note",
  "label": null,
  "workpoints": [
    {
      "description": "concrete one-sentence description of one distinct work-point in Dutch",
      "type": "general|delay|safety|progress|material|rfi",
      "amount": null or numeric estimated cost in EUR if mentioned,
      "responsible": null or short string (subcontractor/role)
    }
  ]
}

Rules:
- A single memo usually contains 1–5 distinct work-points (separate decisions, agreements, defects, requests). Split them out into the workpoints[] array — DO NOT collapse multiple things into one description.
- workpoints[].description must be self-contained (no pronouns referring to other points).
- workpoints[].amount: extract any euro amount tied to a point ("ongeveer 2840 euro" → 2840); else null.
- workpoints[].responsible: who is on the hook (sub name, "bouwheer", "architect", "leverancier"); else null.
- type "delay": any work stoppage; safety: hazard; progress: milestone; material: supply; rfi: needs clarification; general: otherwise.
- flags: 1-3 short phrases max.
- suggestRFI: true if any work-point needs formal designer/engineer clarification.${labelSection}`
      }]
    });
    const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    logAIUsage('process-log', 'claude-haiku-4-5-20251001', response.usage, projectId, { source });
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.workpoints)) parsed.workpoints = [];
    parsed.workpoints = parsed.workpoints.map(wp => ({
      description: String(wp.description || '').trim(),
      type:        wp.type || 'general',
      amount:      wp.amount != null ? Number(wp.amount) : null,
      responsible: wp.responsible || null,
    })).filter(wp => wp.description.length > 0);
    if (typeof parsed.label === 'string') {
      const cleaned = parsed.label.trim().replace(/[.,;:!?]+$/, '').split(/\s+/).slice(0, 2).join(' ');
      parsed.label = cleaned.length ? cleaned : null;
    } else {
      parsed.label = null;
    }
    return parsed;
  } catch (err) {
    if (err.status === 529 && attempt < 3) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
      return processNote(note, location, labels, { projectId, source, attempt: attempt + 1 });
    }
    throw err;
  }
}

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
  } catch (err) { console.warn('WhatsApp reply failed:', err.message); }
}

async function resolveWhatsAppProject(from) {
  if (!supabaseAdmin) return process.env.WHATSAPP_DEFAULT_PROJECT_ID || null;
  const { data: state } = await supabaseAdmin
    .from('wa_sender_state').select('project_id').eq('phone_number', from).maybeSingle();
  if (state?.project_id) return state.project_id;
  const { data: member } = await supabaseAdmin
    .from('project_members').select('project_id').eq('whatsapp_phone', from).maybeSingle();
  if (member?.project_id) return member.project_id;
  return process.env.WHATSAPP_DEFAULT_PROJECT_ID || null;
}

function formatProjectName(project) {
  return `${project.name}${project.project_number ? ` (#${project.project_number})` : ''}`;
}

async function resolveProjectWithAI(query, projects) {
  if (!projects?.length) return null;
  if (projects.length === 1) return projects[0];
  const projectList = projects.map((p, i) => `${i + 1}. ${formatProjectName(p)}`).join('\n');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{
        role: 'user',
        content: `You are helping a construction worker switch to the right project on their phone.\n\nProjects:\n${projectList}\n\nUser typed: "${query}"\n\nWhich project number (1, 2, 3…) best matches? Reply with ONLY the number, or "none" if nothing fits.`,
      }],
    });
    logAIUsage('whatsapp-project-match', 'claude-haiku-4-5-20251001', response.usage, null, { source: 'whatsapp' });
    const idx = parseInt(response.content[0].text.trim(), 10);
    if (!isNaN(idx) && idx >= 1 && idx <= projects.length) return projects[idx - 1];
  } catch (err) { console.warn('resolveProjectWithAI failed:', err.message); }
  return null;
}

async function inferProjectFromNote(transcript, projects) {
  if (!projects?.length) return null;
  if (projects.length === 1) return projects[0];
  const projectList = projects.map((p, i) => `${i + 1}. ${formatProjectName(p)}`).join('\n');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{
        role: 'user',
        content: `You are helping assign a construction field note to the correct project.\n\nProjects:\n${projectList}\n\nVoice note: "${transcript}"\n\nWhich project number (1, 2, 3…) does this note most likely belong to? Reply with ONLY the number, or "none" if you cannot determine.`,
      }],
    });
    logAIUsage('whatsapp-project-infer', 'claude-haiku-4-5-20251001', response.usage, null, { source: 'whatsapp' });
    const idx = parseInt(response.content[0].text.trim(), 10);
    if (!isNaN(idx) && idx >= 1 && idx <= projects.length) return projects[idx - 1];
  } catch (err) { console.warn('inferProjectFromNote failed:', err.message); }
  return null;
}

function parseWaCommand(text) {
  const t = text.trim().toLowerCase();
  if (/^help$/.test(t)) return { command: 'help' };
  if (/^(my\s+)?projects?(\s+list)?$|^list(\s+projects?)?$/.test(t)) return { command: 'list' };
  if (/^status$/.test(t)) return { command: 'status' };
  const m = t.match(/^(?:project|switch(?:\s+to)?|use(?:\s+project)?|set(?:\s+project)?)\s+(.+)$/);
  if (m) return { command: 'switch', query: m[1].trim() };
  return { command: null };
}

// Heuristic: is this free-form text a question?
function isQuestion(text) {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  // NL question starters
  if (/^(wat|hoe|waar|wanneer|wie|welke|waarom|kan je|kun je|kunnen we|geef me|toon me|laat (me )?zien|vat samen|wat moet ik|wat zijn|hoeveel|is er|zijn er|heb ik|hebben we)\b/.test(t)) return true;
  // EN question starters
  if (/^(what|how|where|when|who|which|why|can you|could you|show me|list|tell me|do i|did i|is there|are there|has|have)\b/.test(t)) return true;
  return false;
}

// Inline project Q&A — mirrors /api/project-chat but called server-side from the WA webhook.
async function answerProjectQuestion(projectId, question) {
  if (!supabaseAdmin || !projectId) return null;
  const [{ data: project }, { data: ctx }, { data: contacts }, { data: logs }] = await Promise.all([
    supabaseAdmin.from('projects').select('id, name, city, project_number, status, client_name').eq('id', projectId).maybeSingle(),
    supabaseAdmin.from('project_context').select('category, title, content, source').eq('project_id', projectId).order('created_at', { ascending: false }).limit(6),
    supabaseAdmin.from('project_contacts').select('name, role, email, phone').eq('project_id', projectId),
    supabaseAdmin.from('field_logs').select('processed_summary, raw_note, type, location, created_at, source').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!project) return null;

  const ctxBlock = (ctx || []).map(i =>
    `[${i.category?.toUpperCase()} — ${i.title}]\n${(i.content || '').slice(0, 1200)}`
  ).join('\n\n');

  const contactsBlock = (contacts || []).length
    ? (contacts || []).map(c => `· ${c.name}${c.role ? ` (${c.role})` : ''}${c.email ? ` — ${c.email}` : ''}`).join('\n')
    : '(geen contacten geregistreerd)';

  const logsBlock = (logs || []).map(l => {
    const date = new Date(l.created_at).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
    return `── ${date} ──\n${(l.processed_summary || l.raw_note || '').slice(0, 280)}`;
  }).join('\n\n');

  const systemPrompt = `Je bent Punchlister, de admin-assistent van een Belgische projectleider in de bouw. Je antwoordt via WhatsApp — kort, in het Nederlands, MAX 6 regels of 600 tekens. Geen markdown headers, geen bullet-points. Alleen platte zinnen of een korte genummerde lijst (max 5 items, één regel per item). Grond elk antwoord in de project-data. Als iets niet in de data staat: zeg dat letterlijk.

PROJECT
· Naam: ${project.name}
${project.client_name ? `· Klant: ${project.client_name}\n` : ''}${project.city ? `· Locatie: ${project.city}\n` : ''}· Status: ${project.status || 'active'}

CONTACTEN
${contactsBlock}

CONTEXT-DOCUMENTEN
${ctxBlock || '(geen documenten geüpload)'}

WERFBEZOEK-MEMO'S (laatste 20)
${logsBlock || '(nog geen memo\'s)'}`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    });
    logAIUsage('whatsapp-qa', 'claude-haiku-4-5-20251001', resp.usage, projectId, { source: 'whatsapp' });
    let reply = resp.content?.[0]?.text?.trim() || '';
    if (reply.length > 1500) reply = reply.slice(0, 1500) + '…';
    return reply;
  } catch (err) {
    console.warn('whatsapp-qa failed:', err.message);
    return null;
  }
}

async function handleMessages(body) {
  const entry  = body?.entry?.[0];
  const change = entry?.changes?.[0];
  if (change?.field !== 'messages') return;

  const value    = change.value;
  const messages = value?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;

  for (const msg of messages) {
    const from    = msg.from;
    const msgId   = msg.id;
    const type    = msg.type;
    const text    = msg.text?.body ?? null;
    const display = value?.metadata?.display_phone_number;

    const projectId = await resolveWhatsAppProject(from);

    if (supabaseAdmin) {
      supabaseAdmin.from('whatsapp_messages').insert({
        from_number: from, display_phone_number: display ?? null,
        message_id: msgId, message_type: type, body: text, raw: body, project_id: projectId,
      }).then(({ error }) => { if (error) console.warn('whatsapp_messages insert:', error.message); });
    }

    if (type === 'text' && text) {
      if (supabaseAdmin) {
        const { data: senderState } = await supabaseAdmin
          .from('wa_sender_state').select('pending_question, pending_log_id')
          .eq('phone_number', from).maybeSingle();

        if (senderState?.pending_question === 'location') {
          const isSkip = /^skip$/i.test(text.trim());
          const location = isSkip ? null : text.trim();
          await supabaseAdmin.from('wa_sender_state')
            .update({ pending_question: null, pending_log_id: null })
            .eq('phone_number', from);
          if (!isSkip && senderState.pending_log_id && location) {
            await supabaseAdmin.from('field_logs').update({ location }).eq('id', senderState.pending_log_id);
            await sendWhatsAppReply(from, `📍 Locatie opgeslagen: *${location}*`);
          } else {
            await sendWhatsAppReply(from, 'OK, locatie blanco gelaten.');
          }
          continue;
        }
      }

      const { command, query } = parseWaCommand(text);

      if (command === 'help') {
        await sendWhatsAppReply(from,
          'Punchlister commando\'s:\n' +
          '• *project [naam of #]* — wissel actief project\n' +
          '• *projecten* — lijst van je projecten\n' +
          '• *status* — status van het actieve project\n\n' +
          'Of stel gewoon een vraag, bv:\n' +
          '"Wat moet ik voorbereiden voor de meet met de klant?"\n' +
          '"Welke meerwerken staan nog open?"\n\n' +
          'Stuur een spraakmemo of tekst om te loggen.');
        continue;
      }

      if (command === 'list') {
        if (!supabaseAdmin) { await sendWhatsAppReply(from, 'Dienst niet beschikbaar.'); continue; }
        const { data: rows } = await supabaseAdmin
          .from('project_members')
          .select('project_id, projects(name, project_number)')
          .eq('whatsapp_phone', from);
        if (!rows?.length) {
          await sendWhatsAppReply(from, 'Geen projecten gekoppeld aan dit nummer.\nVraag je projectleider om je WhatsApp-nummer toe te voegen in Project-instellingen.');
        } else {
          const lines = rows.map(r => `• ${formatProjectName(r.projects)}`);
          await sendWhatsAppReply(from, `Je projecten:\n${lines.join('\n')}`);
        }
        continue;
      }

      if (command === 'status') {
        if (!supabaseAdmin) { await sendWhatsAppReply(from, 'Dienst niet beschikbaar.'); continue; }
        if (!projectId) {
          await sendWhatsAppReply(from, 'Geen actief project ingesteld.\nType *project [naam]* om er een te kiezen.');
          continue;
        }
        const { data: project } = await supabaseAdmin
          .from('projects').select('name, project_number').eq('id', projectId).maybeSingle();

        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentLogs } = await supabaseAdmin
          .from('field_logs')
          .select('type, impact, action_required, suggest_rfi, processed_summary, flags, created_at')
          .eq('project_id', projectId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(60);

        const projectName = project ? formatProjectName(project) : projectId;

        if (!recentLogs?.length) {
          await sendWhatsAppReply(from, `📊 *${projectName}*\n\nGeen activiteit gelogd in de laatste 30 dagen.`);
          continue;
        }

        const logLines = recentLogs.map(l => {
          const date = new Date(l.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
          const parts = [`[${date}] ${l.type?.toUpperCase()}`];
          if (l.processed_summary) parts.push(`— ${l.processed_summary}`);
          if (l.impact && l.impact !== 'none') parts.push(`(impact: ${l.impact})`);
          if (l.action_required) parts.push('[ACTIE NODIG]');
          if (l.suggest_rfi) parts.push('[MEERWERK]');
          return parts.join(' ');
        }).join('\n');

        const healthPrompt = `Je bent een Belgische projectleider-assistent in de bouw. Op basis van onderstaande werfnotities van de laatste 30 dagen, schrijf een korte status van het project voor WhatsApp (max 3-5 zinnen). Schrijf in het Nederlands. Wees direct en praktisch. Vermeld de algemene pols, zorgpunten die aandacht vragen, en wat goed gaat. Geen markdown-headers of bullets — gewone zinnen.

Project: ${projectName}
Recente werfnotities (${recentLogs.length} stuks):
${logLines}`;

        let summary;
        try {
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [{ role: 'user', content: healthPrompt }],
          });
          summary = response.content[0].text.trim();
          logAIUsage('whatsapp-status', 'claude-haiku-4-5-20251001', response.usage, projectId, { source: 'whatsapp' });
        } catch (err) {
          console.warn('WhatsApp status AI failed:', err.message);
          summary = null;
        }

        if (summary) {
          await sendWhatsAppReply(from, `📊 *${projectName}*\n\n${summary}`);
        } else {
          // Fallback to basic counts if AI fails
          const counts = { delay: 0, safety: 0, progress: 0, material: 0, rfi: 0, general: 0 };
          let actionCount = 0;
          for (const l of recentLogs) {
            if (l.type in counts) counts[l.type]++;
            if (l.action_required) actionCount++;
          }
          const TYPE_NL = { delay: 'Vertraging', safety: 'Veiligheid', progress: 'Voortgang', material: 'Materiaal', rfi: 'Meerwerk', general: 'Algemeen' };
          const lines = [`📊 *${projectName}* (laatste 30 dagen)`, `${recentLogs.length} werfnotitie${recentLogs.length !== 1 ? 's' : ''}:`, ''];
          for (const [type, count] of Object.entries(counts)) {
            if (count > 0) lines.push(`${TYPE_EMOJI[type]} ${TYPE_NL[type] || type}: ${count}`);
          }
          if (actionCount > 0) lines.push('', `⚠️ ${actionCount} ${actionCount !== 1 ? 'punten vragen' : 'punt vraagt'} actie`);
          await sendWhatsAppReply(from, lines.join('\n'));
        }
        continue;
      }

      if (command === 'switch') {
        if (!supabaseAdmin) { await sendWhatsAppReply(from, 'Dienst niet beschikbaar.'); continue; }
        const { data: memberRows } = await supabaseAdmin
          .from('project_members')
          .select('project_id, projects(id, name, project_number)')
          .eq('whatsapp_phone', from);
        const allProjects = (memberRows || []).map(r => r.projects).filter(Boolean);
        if (!allProjects.length) {
          await sendWhatsAppReply(from, 'Geen projecten gekoppeld aan dit nummer.\nVraag je projectleider om je WhatsApp-nummer toe te voegen in Project-instellingen.');
          continue;
        }
        // 1. Try simple case-insensitive substring match
        const normalizedQuery = query.toLowerCase();
        const simpleMatches = allProjects.filter(p =>
          p.name.toLowerCase().includes(normalizedQuery) ||
          (p.project_number && p.project_number.toLowerCase().includes(normalizedQuery))
        );
        let p = null;
        if (simpleMatches.length === 1) {
          p = simpleMatches[0];
        } else {
          // 2. Use AI to pick the best match (from simple candidates if any, else all projects)
          p = await resolveProjectWithAI(query, simpleMatches.length > 1 ? simpleMatches : allProjects);
        }
        if (!p) {
          const list = allProjects.map(proj => `• ${formatProjectName(proj)}`).join('\n');
          await sendWhatsAppReply(from, `Geen project gevonden voor "${query}".\n\nJe projecten:\n${list}`);
          continue;
        }
        await supabaseAdmin.from('wa_sender_state').upsert(
          { phone_number: from, project_id: p.id, updated_at: new Date().toISOString() },
          { onConflict: 'phone_number' }
        );
        await sendWhatsAppReply(from,
          `✅ *${formatProjectName(p)}*\n\nWat wil je doen?\n• 🎙 Stuur een spraakmemo — werfnotitie loggen\n• *status* — projectstatus\n• *projecten* — lijst van al je projecten\n• *help* — alle commando\'s`
        );
        continue;
      }

      // ── Free-form text: question vs memo ────────────────────────────
      if (isQuestion(text)) {
        if (!projectId) {
          await sendWhatsAppReply(from, 'Geen actief project. Type *project [naam]* om een project te kiezen, en stel daarna je vraag opnieuw.');
          continue;
        }
        const answer = await answerProjectQuestion(projectId, text);
        if (answer) {
          await sendWhatsAppReply(from, answer);
        } else {
          await sendWhatsAppReply(from, 'Kon je vraag niet beantwoorden. Probeer het opnieuw of stuur een spraakmemo om te loggen.');
        }
        continue;
      }

      // Otherwise: log free-form text as a memo on the active project (was previously dropped silently).
      if (!projectId) {
        await sendWhatsAppReply(from, 'Geen actief project. Type *project [naam]* of stuur eerst *help*.');
        continue;
      }
      if (supabaseAdmin) {
        let parsed = null;
        try { parsed = await processNote(text, '', [], { projectId, source: 'whatsapp' }); }
        catch (err) { console.warn('whatsapp text-as-memo processing failed:', err.message); }
        const fallback = !parsed;
        if (fallback) parsed = { summary: text, type: 'general', flags: [], impact: 'none', actionRequired: false, suggestRFI: false, workpoints: [] };

        const { data: savedLog, error } = await supabaseAdmin.from('field_logs').insert({
          project_id:        projectId,
          raw_note:          text,
          location:          parsed.extractedLocation || null,
          processed_summary: fallback ? null : parsed.summary,
          type:              parsed.type,
          flags:             parsed.flags,
          impact:            parsed.impact,
          action_required:   parsed.actionRequired,
          suggest_rfi:       parsed.suggestRFI,
          processing:        fallback,
          label:             parsed.label || null,
          source:            'whatsapp',
          workpoints:        parsed.workpoints || [],
        }).select('id').single();

        if (error) {
          console.error('whatsapp text-memo insert error:', error.message);
          await sendWhatsAppReply(from, 'Kon de memo niet opslaan.');
        } else {
          const TYPE_NL_TEXT = { delay: 'Vertraging', safety: 'Veiligheid', progress: 'Voortgang', material: 'Materiaal', rfi: 'Meerwerk', general: 'Algemeen', dispute: 'Betwisting' };
          const typeLabel = TYPE_NL_TEXT[parsed.type] || 'Algemeen';
          await sendWhatsAppReply(from, `📝 *${typeLabel}* gelogd${parsed.summary ? `\n\n${parsed.summary}` : ''}`);
        }
      }

      continue;
    }

    if (type === 'audio') {
      if (!openai) {
        console.warn('WhatsApp voice note received but GROQ_API_KEY not set');
        await sendWhatsAppReply(from, '⚠️ Voice notes zijn momenteel niet beschikbaar (transcriptie-dienst niet geconfigureerd). Stuur je memo als tekst.');
        continue;
      }
      const mediaId = msg.audio?.id;
      if (!mediaId) { await sendWhatsAppReply(from, '⚠️ Voice note ontvangen maar geen media-ID gevonden.'); continue; }

      let transcript = null;
      const tmpPath = path.join(os.tmpdir(), `tmp_wa_${Date.now()}.ogg`);
      try {
        const metaUrlRes  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
        });
        const metaUrlJson = await metaUrlRes.json();
        const audioUrl    = metaUrlJson?.url;
        if (!audioUrl) throw new Error('media URL niet beschikbaar');

        const audioRes = await fetch(audioUrl, {
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }
        });
        fs.writeFileSync(tmpPath, Buffer.from(await audioRes.arrayBuffer()));

        const result = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-large-v3-turbo',
        });
        transcript = result.text;
      } catch (err) {
        console.error('WhatsApp: voice transcription failed:', err);
        await sendWhatsAppReply(from, `⚠️ Voice note kon niet getranscribeerd worden (${err.message}). Probeer opnieuw of stuur als tekst.`);
        try { fs.unlinkSync(tmpPath); } catch {}
        continue;
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      if (!transcript || !transcript.trim()) {
        await sendWhatsAppReply(from, '⚠️ Voice note bevat geen verstaanbare tekst.');
        continue;
      }

      // If no active project, try to infer one from the transcript
      let resolvedProjectId = projectId;
      let inferredProject = null;
      if (!resolvedProjectId && supabaseAdmin) {
        const { data: memberRows } = await supabaseAdmin
          .from('project_members')
          .select('project_id, projects(id, name, project_number)')
          .eq('whatsapp_phone', from);
        const allProjects = (memberRows || []).map(r => r.projects).filter(Boolean);
        if (allProjects.length === 1) {
          inferredProject = allProjects[0];
        } else if (allProjects.length > 1) {
          inferredProject = await inferProjectFromNote(transcript, allProjects);
        }
        if (inferredProject) resolvedProjectId = inferredProject.id;
      }

      let data = null;
      try {
        data = await processNote(transcript, '', [], { projectId: resolvedProjectId, source: 'whatsapp' });
      } catch (err) {
        console.warn('WhatsApp: AI processing failed, saving raw note:', err.message);
      }
      const fallback = !data;
      if (fallback) {
        data = { summary: transcript, type: 'general', flags: [], impact: 'none', actionRequired: false, suggestRFI: false };
      }

      if (supabaseAdmin && resolvedProjectId) {
        const extractedLocation = data.extractedLocation || null;
        const { data: savedLog, error } = await supabaseAdmin.from('field_logs').insert({
          project_id:        resolvedProjectId,
          raw_note:          transcript,
          location:          extractedLocation,
          processed_summary: fallback ? null : data.summary,
          type:              data.type,
          flags:             data.flags,
          impact:            data.impact,
          action_required:   data.actionRequired,
          suggest_rfi:       data.suggestRFI,
          processing:        fallback,
          label:             data.label || null,
          log_date:          data.extractedDate || null,
          source:            'whatsapp',
          workpoints:        data.workpoints || [],
          recommended_outputs: data.recommendedOutputs || [],
        }).select('id').single();

        if (error) {
          console.error('WhatsApp: DB insert error:', error.message);
          await sendWhatsAppReply(from, `⚠️ Voice note ontvangen, maar opslaan mislukte: ${error.message}`);
        } else {
          const impactLine = { schedule: '📅 Impact op planning', cost: '💰 Impact op kost', safety: '🚨 Veiligheidsimpact' };
          const TYPE_NL = { delay: 'Vertraging', safety: 'Veiligheid', progress: 'Voortgang', material: 'Materiaal', rfi: 'Meerwerk', general: 'Algemeen', dispute: 'Betwisting' };
          const typeLabel  = TYPE_NL[data.type] || 'Algemeen';

          const lines = [
            `${TYPE_EMOJI[data.type] || '📝'} *${typeLabel}* gelogd${inferredProject ? ` → *${formatProjectName(inferredProject)}*` : ''}`,
            '',
            data.summary || transcript.slice(0, 120),
          ];
          if (extractedLocation)       lines.push(`📍 ${extractedLocation}`);
          if (data.flags?.length)      lines.push(`🏷 ${data.flags.join(' · ')}`);
          if (impactLine[data.impact]) lines.push(impactLine[data.impact]);
          if (data.actionRequired)     lines.push('⚠️ Actie nodig');
          if (data.suggestRFI)         lines.push('📋 Meerwerk gesuggereerd — open de app om op te stellen');

          const needsLocation = !extractedLocation;
          if (needsLocation) lines.push('', '📍 Waar gebeurde dit? Antwoord met de locatie, of "skip".');

          await sendWhatsAppReply(from, lines.join('\n'));

          if (needsLocation && savedLog?.id) {
            await supabaseAdmin.from('wa_sender_state').upsert(
              {
                phone_number:     from,
                project_id:       resolvedProjectId,
                pending_question: 'location',
                pending_log_id:   savedLog.id,
                updated_at:       new Date().toISOString(),
              },
              { onConflict: 'phone_number' }
            );
          }
        }
      } else if (!resolvedProjectId) {
        await sendWhatsAppReply(from, 'Werfnotitie ontvangen, maar geen actief project voor dit nummer.\nType *project [naam]* om er een te kiezen.');
      }
    }
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    await handleMessages(req.body);
    res.status(200).end();
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message);
    res.status(200).end();
  }
}

export const config = { maxDuration: 60 };
