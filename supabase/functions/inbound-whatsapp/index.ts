import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Types ─────────────────────────────────────────────────────────────────────

type MessageType = 'text' | 'audio' | 'image';
type FieldLogType = 'delay' | 'safety' | 'progress' | 'material' | 'rfi' | 'general';

interface ClaudeClassification {
  type: FieldLogType;
  summary: string;
  flags: string[];
  impact: 'none' | 'schedule' | 'cost' | 'safety';
  actionRequired: boolean;
  suggestRFI: boolean;
  actionItems: Array<{ task: string; assignee: string }>;
}

// ── X-Hub-Signature-256 verification ─────────────────────────────────────────

async function verifySignature(rawBody: ArrayBuffer, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, rawBody);
  const expected = 'sha256=' + Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== sigHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigHeader.charCodeAt(i);
  }
  return diff === 0;
}

// ── Deterministic AES-256-GCM phone encryption ───────────────────────────────
// Must match the Node.js implementation in api/webhooks/whatsapp.js exactly
// so that phone numbers stored during opt-in can be looked up here.

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(raw: string): string {
  return String(raw).replace(/[^\d]/g, '');
}

async function encryptPhone(plain: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const plainBytes = new TextEncoder().encode(plain);

  // Derive deterministic 12-byte IV = first 12 bytes of HMAC-SHA256(plain, key)
  const hmacKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const ivFull = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, plainBytes));
  const iv = ivFull.slice(0, 12);

  const aesKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'],
  );
  // Web Crypto appends the 16-byte auth tag to the ciphertext
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plainBytes),
  );
  const ciphertext = encrypted.slice(0, -16);
  const tag = encrypted.slice(-16);

  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

// ── Meta Graph API helpers ────────────────────────────────────────────────────

async function downloadMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const metaRes = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) throw new Error(`Graph API error ${metaRes.status}`);
  const { url, mime_type: mimeType } = await metaRes.json();
  if (!url) throw new Error('Graph API returned no download URL');

  const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);
  return { buffer: new Uint8Array(await fileRes.arrayBuffer()), mimeType };
}

async function sendWhatsAppText(to: string, text: string, accessToken: string, phoneNumberId: string): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json();
    // Code 131026 = outside 24-h session window — fall back to template silently
    if (err?.error?.code === 131026) {
      await sendWhatsAppTemplate(to, accessToken, phoneNumberId);
    } else {
      console.error('[inbound-whatsapp] Send failed:', err?.error?.message);
    }
  }
}

async function sendWhatsAppTemplate(to: string, accessToken: string, phoneNumberId: string): Promise<void> {
  await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: 'site_visit_summary', language: { code: 'nl' } },
      }),
    },
  );
}

// ── Whisper transcription ─────────────────────────────────────────────────────

async function transcribeAudio(buffer: Uint8Array, mimeType: string, openaiKey: string): Promise<string> {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'ogg';
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), `voice.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${await res.text()}`);
  return (await res.text()).trim();
}

// ── Claude classification + summary ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a construction site assistant for Belgian field workers.
Extract action items and produce a structured site visit summary in the same language as the input (Dutch, French, or English).`;

async function classifyWithClaude(
  rawNote: string,
  anthropicKey: string,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<ClaudeClassification> {
  const userContent: unknown[] = [];

  if (imageBase64 && imageMimeType) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
    });
  }

  userContent.push({
    type: 'text',
    text: `${rawNote}\n\nRespond ONLY with a valid JSON object (no markdown, no extra text):
{
  "type": "<delay|safety|progress|material|rfi|general>",
  "summary": "<2-3 sentence professional summary>",
  "flags": ["<tag1>", "<tag2>"],
  "impact": "<none|schedule|cost|safety>",
  "actionRequired": true or false,
  "suggestRFI": true or false,
  "actionItems": [{ "task": "<action>", "assignee": "<Back Office or company name>" }]
}`,
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const raw: string = data.content?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(raw) as Partial<ClaudeClassification>;
    const validTypes: FieldLogType[] = ['delay', 'safety', 'progress', 'material', 'rfi', 'general'];
    if (!validTypes.includes(parsed.type as FieldLogType)) parsed.type = 'general';
    if (!Array.isArray(parsed.flags)) parsed.flags = [];
    if (!Array.isArray(parsed.actionItems)) parsed.actionItems = [];
    parsed.impact = parsed.impact ?? 'none';
    parsed.actionRequired = parsed.actionRequired ?? false;
    parsed.suggestRFI = parsed.suggestRFI ?? false;
    return parsed as ClaudeClassification;
  } catch {
    console.error('[inbound-whatsapp] Claude returned non-JSON:', raw.slice(0, 200));
    return {
      type: 'general', summary: rawNote.slice(0, 200),
      flags: [], impact: 'none', actionRequired: false, suggestRFI: false, actionItems: [],
    };
  }
}

// ── Project resolution ────────────────────────────────────────────────────────
// For WhatsApp we know the exact user, so look up their most recently active project.

async function resolveProject(
  userId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  // 1. Projects owned by the user
  const { data: owned } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owned) return owned.id;

  // 2. Projects the user is a member of
  const { data: membership } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (membership) return membership.project_id;

  return null;
}

// ── Intent detection ──────────────────────────────────────────────────────────
// Works for both typed text and transcribed voice notes.

type Intent =
  | { type: 'field_note' }
  | { type: 'status_report'; daysBack: number; periodLabel: string }
  | { type: 'help' };

async function detectIntent(text: string, anthropicKey: string): Promise<Intent> {
  const today = new Date().toISOString().split('T')[0];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
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
Examples: "gisteren"→daysBack:1, "deze week"→daysBack:7, "laatste 3 dagen"→daysBack:3, "vandaag"→daysBack:1, "deze maand"→daysBack:30

Return exactly one of:
{"type":"field_note"}
{"type":"status_report","daysBack":7,"periodLabel":"laatste 7 dagen"}
{"type":"help"}`,
      }],
    }),
  });

  if (!res.ok) return { type: 'field_note' };
  const data = await res.json();
  try {
    return JSON.parse(data.content?.[0]?.text ?? '') as Intent;
  } catch {
    return { type: 'field_note' };
  }
}

// ── Status report ─────────────────────────────────────────────────────────────

async function buildStatusReport(
  projectId: string,
  supabase: ReturnType<typeof createClient>,
  daysBack = 7,
  periodLabel = 'laatste 7 dagen',
): Promise<string> {
  const { data: project } = await supabase
    .from('projects')
    .select('name, project_number')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return 'Geen actief project gevonden.';

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabase
    .from('field_logs')
    .select('type, action_required, suggest_rfi, processed_summary, raw_note, created_at')
    .eq('project_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  const projectLabel = project.project_number
    ? `${project.name} (#${project.project_number})`
    : project.name;

  const total = logs?.length ?? 0;
  if (total === 0) {
    return `📊 *Status: ${projectLabel}*\n_${periodLabel}_\n\nGeen activiteit gevonden.`;
  }

  const typeEmoji: Record<string, string> = {
    delay: '🕐', safety: '⚠️', progress: '✅', material: '📦', rfi: '❓', general: '📝',
  };
  const typeCounts: Record<string, number> = {};
  for (const log of logs!) {
    const t = log.type ?? 'general';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  const actionItems = logs!.filter((l) => l.action_required);
  const rfiItems    = logs!.filter((l) => l.suggest_rfi);

  const lines: string[] = [
    `📊 *Status: ${projectLabel}*`,
    `_${periodLabel}_`,
    '',
    `📋 *${total} melding${total !== 1 ? 'en' : ''}*`,
  ];

  for (const t of ['safety', 'delay', 'rfi', 'progress', 'material', 'general']) {
    if (typeCounts[t]) {
      lines.push(`${typeEmoji[t] ?? '📝'} ${t.charAt(0).toUpperCase() + t.slice(1)}: ${typeCounts[t]}`);
    }
  }

  if (actionItems.length) {
    lines.push('', `⚠️ *${actionItems.length} actie${actionItems.length !== 1 ? 's' : ''} vereist:*`);
    for (const log of actionItems.slice(0, 3)) {
      const s = (log.processed_summary ?? log.raw_note ?? '') as string;
      lines.push(`• ${s.slice(0, 80)}${s.length > 80 ? '…' : ''}`);
    }
    if (actionItems.length > 3) lines.push(`  … en ${actionItems.length - 3} meer`);
  }

  if (rfiItems.length) {
    lines.push('', `📋 *${rfiItems.length} RFI${rfiItems.length !== 1 ? "'s" : ''} voorgesteld* — open de app om te starten`);
  }

  lines.push('', `🕓 *Laatste meldingen:*`);
  for (const log of logs!.slice(0, 3)) {
    const s = (log.processed_summary ?? log.raw_note ?? '') as string;
    const date = new Date(log.created_at as string).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
    lines.push(`• [${date}] ${s.slice(0, 70)}${s.length > 70 ? '…' : ''}`);
  }

  return lines.join('\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // GET — Meta webhook verification handshake
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const secret    = Deno.env.get('WHATSAPP_WEBHOOK_SECRET') ?? '';

    if (mode === 'subscribe' && token === secret) {
      console.log('[inbound-whatsapp] Webhook verified ✓');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── Read raw body (needed for signature verification) ─────────────────────
  const rawBody = await req.arrayBuffer();

  // ── Verify X-Hub-Signature-256 ────────────────────────────────────────────
  const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
  const secret    = Deno.env.get('WHATSAPP_WEBHOOK_SECRET') ?? '';
  const valid     = await verifySignature(rawBody, sigHeader, secret);
  if (!valid) {
    console.warn('[inbound-whatsapp] Signature verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Parse payload ─────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Meta sends status update pings with no messages array — acknowledge and exit
  // deno-lint-ignore no-explicit-any
  const message = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const fromRaw: string    = message.from;
  const msgType: MessageType = ['text', 'audio', 'image'].includes(message.type)
    ? message.type as MessageType
    : null!;

  if (!msgType) {
    console.log('[inbound-whatsapp] Ignoring unsupported type:', message.type);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Env vars ──────────────────────────────────────────────────────────────
  const anthropicKey     = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const openaiKey        = Deno.env.get('OPENAI_API_KEY') ?? '';
  const accessToken      = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
  const phoneNumberId    = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const phoneEncKey      = Deno.env.get('WHATSAPP_PHONE_ENCRYPTION_KEY') ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ── Look up sender in whatsapp_users ──────────────────────────────────────
  const normalizedFrom = normalizePhone(fromRaw);
  const encryptedFrom  = await encryptPhone(normalizedFrom, phoneEncKey);

  const { data: waUser } = await supabase
    .from('whatsapp_users')
    .select('id, user_id, status, phone_number')
    .eq('phone_number', encryptedFrom)
    .maybeSingle();

  if (!waUser) {
    console.log('[inbound-whatsapp] Unrecognised sender, ignoring:', normalizedFrom);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Update whatsapp_users ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const waUpdates: Record<string, unknown> = { last_inbound_at: now };
  if (waUser.status === 'pending') {
    waUpdates.status      = 'active';
    waUpdates.opted_in_at = now;
    console.log('[inbound-whatsapp] Activated user', waUser.user_id);
  }
  await supabase.from('whatsapp_users').update(waUpdates).eq('id', waUser.id);

  // ── Extract raw note / transcript from message ───────────────────────────
  let rawNote  = '';
  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;

  try {
    if (msgType === 'text') {
      rawNote = message.text?.body ?? '';

    } else if (msgType === 'audio') {
      const { buffer, mimeType } = await downloadMedia(message.audio.id, accessToken);
      rawNote = await transcribeAudio(buffer, mimeType, openaiKey);
      console.log('[inbound-whatsapp] Transcript:', rawNote.slice(0, 120));

    } else if (msgType === 'image') {
      const { buffer, mimeType } = await downloadMedia(message.image.id, accessToken);
      const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      imageMimeType = supportedTypes.includes(mimeType) ? mimeType : 'image/jpeg';
      imageBase64 = btoa(String.fromCharCode(...buffer));
      rawNote = message.image?.caption ?? '(image — no caption)';
    }
  } catch (err) {
    console.error('[inbound-whatsapp] Media processing error:', err);
    rawNote = `[${msgType} message — processing error]`;
  }

  if (!rawNote && !imageBase64) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Intent detection (text + audio; skip for images) ─────────────────────
  // Runs before field-log classification so queries never end up as log entries.
  if (msgType !== 'image' && rawNote) {
    const intent = await detectIntent(rawNote, anthropicKey);
    console.log('[inbound-whatsapp] Intent:', JSON.stringify(intent));

    if (intent.type === 'help') {
      await sendWhatsAppText(
        normalizedFrom,
        'Punchlister commando\'s:\n• *status* — statusrapport van je project\nOf stuur een spraakbericht of tekst om een melding te loggen.',
        accessToken, phoneNumberId,
      );
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (intent.type === 'status_report') {
      const projectId = await resolveProject(waUser.user_id, supabase);
      if (!projectId) {
        await sendWhatsAppText(normalizedFrom, 'Geen actief project gevonden.', accessToken, phoneNumberId);
      } else {
        const report = await buildStatusReport(
          projectId, supabase,
          (intent as Extract<Intent, { type: 'status_report' }>).daysBack,
          (intent as Extract<Intent, { type: 'status_report' }>).periodLabel,
        );
        await sendWhatsAppText(normalizedFrom, report, accessToken, phoneNumberId);
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    // intent === 'field_note' → fall through to classification + logging below
  }

  // ── Classify with Claude ──────────────────────────────────────────────────
  let classification: ClaudeClassification = {
    type: 'general', summary: rawNote.slice(0, 200),
    flags: [], impact: 'none', actionRequired: false, suggestRFI: false, actionItems: [],
  };
  try {
    classification = await classifyWithClaude(rawNote, anthropicKey, imageBase64, imageMimeType);
  } catch (err) {
    console.error('[inbound-whatsapp] Claude error:', err);
  }

  // ── Resolve project ───────────────────────────────────────────────────────
  const projectId = await resolveProject(waUser.user_id, supabase);
  if (!projectId) {
    console.warn('[inbound-whatsapp] No project found for user', waUser.user_id);
  }

  // ── Insert into field_logs ────────────────────────────────────────────────
  const { data: fieldLog, error: insertErr } = await supabase
    .from('field_logs')
    .insert({
      source:            'whatsapp',
      project_id:        projectId,
      user_id:           waUser.user_id,
      raw_note:          rawNote,
      processed_summary: classification.summary,
      type:              classification.type,
      flags:             classification.flags,
      impact:            classification.impact,
      action_required:   classification.actionRequired,
      suggest_rfi:       classification.suggestRFI,
      action_items:      classification.actionItems,
      processing:        false,
      log_date:          new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[inbound-whatsapp] field_logs insert failed:', insertErr.message);
    // Still return 200 — Meta must not retry this message
    return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[inbound-whatsapp] Field log created:', fieldLog.id, '| type:', classification.type);

  // ── Reply on WhatsApp ─────────────────────────────────────────────────────
  const replyText = [
    `📋 *Summary:* ${classification.summary}`,
    classification.actionItems.length
      ? `\n✅ *Action items:*\n${classification.actionItems.map((a) => `• ${a.task} → ${a.assignee}`).join('\n')}`
      : '',
  ].filter(Boolean).join('');

  await sendWhatsAppText(normalizedFrom, replyText, accessToken, phoneNumberId);

  return new Response(
    JSON.stringify({ success: true, field_log_id: fieldLog.id, type: classification.type }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
