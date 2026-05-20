import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Mailgun signature verification ───────────────────────────────────────────

async function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  if (!timestamp || !token || !signature || !signingKey) return false;

  // Reject replays older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const message = encoder.encode(timestamp + token);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ── Multipart parser ─────────────────────────────────────────────────────────

async function parseMultipart(
  req: Request,
  boundary: string,
): Promise<Record<string, string>> {
  const buf = await req.arrayBuffer();
  const text = new TextDecoder().decode(buf);
  const fields: Record<string, string> = {};

  const delimiterRE = new RegExp(`--${escapeRE(boundary)}(?:--)?\\r?\\n`, 'g');
  const parts = text.split(delimiterRE).slice(1); // drop preamble

  for (const part of parts) {
    if (!part || part.startsWith('--')) continue;

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerBlock = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4).replace(/\r\n$/, '');

    const nameMatch = headerBlock.match(/name="([^"]+)"/);
    const isFile = headerBlock.includes('filename=');
    if (!nameMatch || isFile) continue; // skip attachment binary parts

    fields[nameMatch[1]] = body;
  }

  return fields;
}

function escapeRE(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Claude classification ─────────────────────────────────────────────────────

type FieldLogType = 'delay' | 'safety' | 'progress' | 'material' | 'rfi' | 'general';

interface ProjectRow {
  id: string;
  name: string;
  client_name: string | null;
  city: string | null;
  project_number: string | null;
}

interface ClaudeClassification {
  type: FieldLogType;
  project_id: string | null;   // UUID from the provided project list, or null
  project_keywords: string[];  // fallback hints for word-scoring if project_id is null
}

function buildProjectList(projects: ProjectRow[]): string {
  if (!projects.length) return '(no projects available)';
  return projects
    .map((p) => {
      const parts = [p.name];
      if (p.project_number) parts.push(`#${p.project_number}`);
      if (p.client_name) parts.push(`client: ${p.client_name}`);
      if (p.city) parts.push(p.city);
      return `- id:${p.id} | ${parts.join(' | ')}`;
    })
    .join('\n');
}

async function classifyWithClaude(
  subject: string,
  body: string,
  anthropicKey: string,
  projects: ProjectRow[],
): Promise<ClaudeClassification> {
  const projectList = buildProjectList(projects);

  const prompt = `You are a construction site assistant. Your job is to classify an incoming email and identify which project it belongs to.

## Known projects
${projectList}

## Email
Subject: ${subject || '(no subject)'}
Body:
${body || '(empty body)'}

## Instructions
1. Classify the email type.
2. Identify the most likely project from the list above. Use semantic reasoning — the email may refer to the project by street name, neighbourhood, client name, building name, project code, or a partial/informal version of the project name. Pick the best match even if it is not an exact word-for-word match.
3. If you are confident about the project, set "project_id" to its exact id value from the list. If you are not at all sure, set it to null.
4. Also set "project_keywords" to any words or phrases from the email that could help identify the project (street names, area names, client names, codes). This is used as a fallback.

Respond ONLY with a valid JSON object (no markdown fences, no extra text):
{
  "type": "<one of: delay, safety, progress, material, rfi, general>",
  "project_id": "<exact id value from the project list, or null>",
  "project_keywords": ["<keyword>", ...]
}

Type definitions:
- delay: email is about a delay, schedule issue, or timing problem
- safety: email is about a safety incident, hazard, or safety concern
- progress: email is about construction progress, site status, or work completion
- material: email is about materials, deliveries, equipment, or supplies
- rfi: email is a request for information, clarification, or design question
- general: anything else`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText: string = data.content?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(rawText) as Partial<ClaudeClassification>;
    const validTypes: FieldLogType[] = ['delay', 'safety', 'progress', 'material', 'rfi', 'general'];
    if (!validTypes.includes(parsed.type as FieldLogType)) parsed.type = 'general';
    if (!Array.isArray(parsed.project_keywords)) parsed.project_keywords = [];

    // Validate that the returned project_id actually exists in our list
    const validIds = new Set(projects.map((p) => p.id));
    if (parsed.project_id && !validIds.has(parsed.project_id)) {
      console.warn('[inbound-email] Claude returned unknown project_id:', parsed.project_id);
      parsed.project_id = null;
    }

    return parsed as ClaudeClassification;
  } catch {
    console.error('[inbound-email] Claude returned non-JSON:', rawText.slice(0, 200));
    return { type: 'general', project_id: null, project_keywords: [] };
  }
}

// ── Project matching (word-score fallback) ────────────────────────────────────

const STOP_WORDS = new Set([
  'de', 'het', 'een', 'van', 'voor', 'met', 'aan', 'op', 'uit', 'bij', // Dutch
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'with',
  'to', 'from', 'by', 'as', 'this', 'that', 'it', 'its', 'we', 'our',
  'you', 'your', 'they', 'their', 'project', 're', 'fw', 'fwd', 'about',
]);

function extractSearchWords(texts: (string | null | undefined)[]): string[] {
  return [...new Set(
    texts
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  )];
}

function scoreFuzzyMatch(project: ProjectRow, searchWords: string[]): number {
  const numberFields = [project.project_number].filter(Boolean).join(' ').toLowerCase();
  const nameFields = [project.name, project.client_name, project.city]
    .filter(Boolean).join(' ').toLowerCase();

  let score = 0;
  for (const word of searchWords) {
    if (numberFields.includes(word)) score += 3; // project number is very specific
    else if (nameFields.includes(word)) score += 1;
  }
  return score;
}

function findBestProjectByWords(
  projects: ProjectRow[],
  keywords: string[],
  subject: string,
): ProjectRow | null {
  const searchWords = extractSearchWords([subject, ...keywords]);
  if (!searchWords.length || !projects.length) return null;

  console.log('[inbound-email] Fuzzy search words:', searchWords.join(', '));

  let best: { project: ProjectRow; score: number } | null = null;
  for (const project of projects) {
    const score = scoreFuzzyMatch(project, searchWords);
    // Require score ≥ 2 to avoid false positives on single generic words,
    // unless a project_number word matched (worth 3 each, so score ≥ 3 there).
    if (score >= 2 && (!best || score > best.score)) {
      best = { project, score };
    }
  }

  if (best) {
    console.log(`[inbound-email] Fuzzy match: "${best.project.name}" (score ${best.score})`);
    return best.project;
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // ── Parse body ────────────────────────────────────────────────────────────
  let fields: Record<string, string> = {};

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      fields = Object.fromEntries(new URLSearchParams(text));
    } else if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
      if (!boundaryMatch) {
        return new Response('Missing multipart boundary', { status: 400 });
      }
      fields = await parseMultipart(req, boundaryMatch[1]);
    } else {
      return new Response('Unsupported content-type', { status: 406 });
    }
  } catch (err) {
    console.error('[inbound-email] Body parse error:', err);
    return new Response('Failed to parse body', { status: 400 });
  }

  // ── Verify Mailgun signature ──────────────────────────────────────────────
  const signingKey = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') ?? '';
  const valid = await verifyMailgunSignature(
    fields['timestamp'] ?? '',
    fields['token'] ?? '',
    fields['signature'] ?? '',
    signingKey,
  );

  if (!valid) {
    console.warn('[inbound-email] Signature verification failed');
    return new Response('Invalid signature', { status: 406 });
  }

  // ── Extract email fields ──────────────────────────────────────────────────
  const sender      = fields['sender'] ?? '';
  const from        = fields['from'] ?? '';
  const recipient   = fields['recipient'] ?? '';
  const subject     = fields['subject'] ?? '';
  const bodyPlain   = fields['body-plain'] ?? '';
  const strippedText = fields['stripped-text'] ?? '';

  // Use stripped-text as the canonical body (removes signature and reply chains)
  const emailBody = strippedText || bodyPlain;

  // Extract bare email address from "Display Name <addr@example.com>"
  const senderEmail = (sender.match(/<([^>]+)>/) ?? [])[1]?.toLowerCase()
    ?? sender.toLowerCase();

  console.log('[inbound-email] Received from:', senderEmail, '| subject:', subject);

  // ── Supabase client (service role — bypasses RLS) ─────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ── Deduplicate: skip if same subject+email seen in last 5 minutes ────────
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('field_logs')
    .select('id')
    .eq('user_email', senderEmail)
    .eq('subject', subject)
    .gte('created_at', fiveMinutesAgo)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('[inbound-email] Duplicate detected, skipping:', existing[0].id);
    return new Response(
      JSON.stringify({ success: true, duplicate: true, existing_id: existing[0].id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── Fetch all projects for Claude to match against ───────────────────────
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, client_name, city, project_number');

  const projects: ProjectRow[] = allProjects ?? [];

  // ── Classify with Claude ──────────────────────────────────────────────────
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  let classification: ClaudeClassification = { type: 'general', project_id: null, project_keywords: [] };

  try {
    classification = await classifyWithClaude(subject, emailBody, anthropicKey, projects);
    console.log('[inbound-email] Claude classification:', classification.type,
      '| project_id:', classification.project_id,
      '| keywords:', classification.project_keywords.join(', '));
  } catch (err) {
    console.error('[inbound-email] Claude API failed:', err);
    // Continue with defaults — storing the email is more important than classification
  }

  // ── Resolve project: Claude direct match → word-score fallback ────────────
  let projectId: string | null = classification.project_id;
  let matchedName: string | null = null;

  if (projectId) {
    matchedName = projects.find((p) => p.id === projectId)?.name ?? null;
    console.log('[inbound-email] Claude matched project:', matchedName, '→', projectId);
  } else {
    // Fallback: word-score across project fields using Claude's extracted keywords + subject
    const fuzzy = findBestProjectByWords(projects, classification.project_keywords, subject);
    if (fuzzy) {
      projectId = fuzzy.id;
      matchedName = fuzzy.name;
      console.log('[inbound-email] Fuzzy fallback matched:', matchedName, '→', projectId);
    } else {
      console.log('[inbound-email] No project match found');
    }
  }

  // ── Build raw payload ─────────────────────────────────────────────────────
  const rawPayload: Record<string, unknown> = {
    sender, from, recipient, subject,
    'body-plain': bodyPlain,
    'stripped-text': strippedText,
    timestamp: fields['timestamp'],
    token: fields['token'],
    'attachment-count': fields['attachment-count'] ?? '0',
  };

  // ── Insert into field_logs ────────────────────────────────────────────────
  const logDate = new Date().toISOString().split('T')[0];

  const { data: fieldLog, error: fieldLogError } = await supabase
    .from('field_logs')
    .insert({
      source: 'email',
      project_id: projectId,
      user_email: senderEmail,
      subject: subject || null,
      raw_note: emailBody || null,
      type: classification.type,
      processing: false,
      action_required: false,
      suggest_rfi: false,
      log_date: logDate,
      raw_payload: rawPayload,
    })
    .select('id')
    .single();

  if (fieldLogError) {
    console.error('[inbound-email] field_logs insert failed:', JSON.stringify(fieldLogError));
    return new Response(
      JSON.stringify({
        error: fieldLogError.message,
        code: fieldLogError.code,
        details: fieldLogError.details,
        hint: fieldLogError.hint,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  console.log('[inbound-email] Field log created:', fieldLog.id);
  return new Response(
    JSON.stringify({
      success: true,
      field_log_id: fieldLog.id,
      project_id: projectId,
      type: classification.type,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
