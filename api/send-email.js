// Generic outbound email send + audit-log endpoint.
// Sends via Mailgun, then writes one row to `outbound_emails` so the project's
// "Verzonden" tab and the project email-thread view can read it back.
//
// POST /api/send-email
// Body: {
//   projectId,        // required
//   to,               // string OR string[]
//   cc,               // optional, string OR string[]
//   bcc,              // optional, string OR string[]
//   replyTo,          // optional
//   subject,          // required
//   body,             // required — plain text body
//   html,             // optional — pre-rendered HTML; otherwise auto-generated
//   fieldLogId,       // optional — link to a field log
//   rfiId,            // optional — link to an RFI
//   variationId,      // optional — link to a variation
//   disputeId,        // optional — link to a dispute
//   userId,           // optional — auth user id (audit)
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function toArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function autoHtml(body, project) {
  const paragraphs = String(body || '')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px;line-height:1.55;color:#1f1146;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;background:#F5F2E8;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#0c0040;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    ${paragraphs}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(0,0,0,0.08);font-size:11px;color:#9ca3af;">
      Verstuurd via <strong style="color:#280063;">Punchlister</strong>${project?.name ? ` · ${escapeHtml(project.name)}` : ''}
    </div>
  </div>
</body></html>`;
}

async function sendViaMailgun({ to, cc, bcc, replyTo, from, subject, text, html }) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  // Region: 'eu' or 'us' (default us). Mailgun maintains separate clusters per region;
  // a key from an EU account will get 401 against the US endpoint and vice versa.
  const region = (process.env.MAILGUN_REGION || 'us').toLowerCase();
  const apiHost = region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
  if (!apiKey || !domain) throw new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');

  const params = new URLSearchParams();
  params.set('from', from);
  toArray(to).forEach(t => params.append('to', t));
  toArray(cc).forEach(c => params.append('cc', c));
  toArray(bcc).forEach(b => params.append('bcc', b));
  if (replyTo) params.set('h:Reply-To', replyTo);
  params.set('subject', subject);
  params.set('text', text || '');
  if (html) params.set('html', html);

  const response = await fetch(`https://${apiHost}/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Mailgun send failed (${response.status}): ${detail}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const {
    projectId, to, cc, bcc, replyTo,
    subject, body, html: htmlIn,
    fieldLogId, rfiId, variationId, disputeId,
    userId,
    emailType = 'pv_mail',  // pv_mail | werfmail | reminder | briefing | other
  } = req.body || {};

  if (!projectId)            return res.status(400).json({ error: 'projectId required' });
  if (!to)                   return res.status(400).json({ error: 'to required' });
  if (!subject)              return res.status(400).json({ error: 'subject required' });
  if (!body && !htmlIn)      return res.status(400).json({ error: 'body or html required' });

  const toList  = toArray(to);
  const ccList  = toArray(cc);
  const bccList = toArray(bcc);

  // Project context
  const { data: project } = await supabase
    .from('projects').select('id, name, city, project_number').eq('id', projectId).maybeSingle();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const from    = process.env.MAILGUN_FROM_EMAIL || `noreply@${process.env.MAILGUN_DOMAIN}`;
  const text    = body || '';
  const html    = htmlIn || autoHtml(body || '', project);

  let messageId = null;
  let status    = 'sent';
  let error     = null;

  try {
    const result = await sendViaMailgun({
      to: toList, cc: ccList, bcc: bccList, replyTo, from, subject, text, html,
    });
    messageId = result?.id?.replace(/^<|>$/g, '') || null;
  } catch (err) {
    status = 'failed';
    error  = err.message;
  }

  // Audit-log every attempt (success or failure) so the UI can show what happened.
  const { data: row, error: dbErr } = await supabase
    .from('outbound_emails')
    .insert({
      project_id:    projectId,
      user_id:       userId || null,
      field_log_id:  fieldLogId || null,
      rfi_id:        rfiId || null,
      variation_id:  variationId || null,
      dispute_id:    disputeId || null,
      to_addresses:  toList,
      cc_addresses:  ccList,
      bcc_addresses: bccList,
      reply_to:      replyTo || null,
      subject,
      body_text:     text,
      body_html:     html,
      provider:      'mailgun',
      message_id:    messageId,
      status,
      error,
      email_type:    emailType,
      sent_at:       status === 'sent' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (dbErr) {
    console.error('[send-email] audit-log failed:', dbErr.message);
  }

  // Mark linked field log as treated when send succeeded
  if (status === 'sent' && fieldLogId) {
    await supabase.from('field_logs').update({ treated: true }).eq('id', fieldLogId);
  }
  // Mark linked RFI / variation as sent
  if (status === 'sent' && rfiId) {
    await supabase.from('rfis').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', rfiId);
  }
  if (status === 'sent' && variationId) {
    await supabase.from('variations').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', variationId);
  }

  if (status !== 'sent') {
    return res.status(500).json({ success: false, error, record: row || null });
  }

  return res.json({ success: true, sentAt: row?.sent_at, record: row });
}
