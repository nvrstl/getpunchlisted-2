import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TYPE_LABELS = {
  timing:    'Timing & vertraging',
  meerwerk:  'Meerwerk & scopewijziging',
  kwaliteit: 'Kwaliteitsklacht',
  betaling:  'Betaling & facturatie',
  other:     'Overig',
};

function buildEmailBody({ dispute, project, points }) {
  const lines = [];

  lines.push(`Geachte,`);
  lines.push('');
  lines.push(`In antwoord op uw bericht met betrekking tot "${dispute.subject || 'de ingediende betwisting'}" (ref. ${dispute.number}), betreffende project ${project.name}${project.city ? ` (${project.city})` : ''}, bezorgen wij u hieronder ons standpunt per betwistpunt.`);
  lines.push('');
  lines.push('─'.repeat(60));

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p.draft_response?.trim()) continue;

    lines.push('');
    lines.push(`${i + 1}. ${TYPE_LABELS[p.type] || p.type}${p.description ? ` — ${p.description}` : ''}`);
    lines.push('');
    lines.push(p.draft_response.trim());
    lines.push('');
    lines.push('─'.repeat(60));
  }

  lines.push('');
  lines.push('Wij hopen u hiermee voldoende te hebben geïnformeerd en blijven beschikbaar voor verdere toelichting.');
  lines.push('');
  lines.push('Met vriendelijke groeten,');
  lines.push('');
  lines.push(project.name || 'De aannemer');

  return lines.join('\n');
}

function buildEmailHtml({ dispute, project, points }) {
  const sections = points
    .filter(p => p.draft_response?.trim())
    .map((p, i) => `
      <div style="margin-bottom:24px;padding:20px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400E;margin-bottom:8px;">
          ${String(i + 1).padStart(2, '0')} · ${TYPE_LABELS[p.type] || p.type}
        </div>
        ${p.description
          ? `<div style="font-size:13px;color:#78716C;margin-bottom:12px;font-style:italic;">${p.description}</div>`
          : ''}
        <div style="font-size:14px;color:#1C1917;line-height:1.75;white-space:pre-wrap;">${p.draft_response.trim()}</div>
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F3EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border:1px solid #E7E5E0;border-radius:12px;overflow:hidden;">
    <div style="background:#1C1917;padding:20px 28px;">
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#D97706;letter-spacing:-0.01em;">Punchlister</div>
      <div style="font-size:11px;color:#A8A29E;margin-top:3px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Betwistingsdossier</div>
    </div>
    <div style="padding:20px 28px 0;border-bottom:1px solid #F5F3EF;">
      <div style="font-size:11px;font-family:'Courier New',monospace;color:#78716C;margin-bottom:4px;">${dispute.number}</div>
      <div style="font-size:17px;font-weight:600;color:#1C1917;margin-bottom:6px;">${dispute.subject || 'Antwoord op betwisting'}</div>
      <div style="font-size:12px;color:#78716C;margin-bottom:16px;">${project.name}${project.city ? ` · ${project.city}` : ''}</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:14px;color:#1C1917;line-height:1.75;margin-bottom:20px;">
        Geachte,<br><br>
        In antwoord op uw bericht betreffende <strong>"${dispute.subject || 'de ingediende betwisting'}"</strong> bezorgen wij u hieronder ons standpunt per betwistpunt.
      </p>
      ${sections || '<p style="color:#78716C;font-style:italic;">Geen conceptantwoorden beschikbaar.</p>'}
      <p style="font-size:14px;color:#57534E;line-height:1.75;margin-top:20px;">
        Wij hopen u hiermee voldoende te hebben geïnformeerd en blijven beschikbaar voor verdere toelichting.
      </p>
      <p style="font-size:14px;color:#1C1917;margin-top:16px;font-weight:600;">
        Met vriendelijke groeten,<br>
        <span style="font-weight:400;color:#57534E;">${project.name || 'De aannemer'}</span>
      </p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #F5F3EF;background:#FAFAF8;">
      <div style="font-size:11px;color:#A8A29E;">Verstuurd via <strong style="color:#78716C;">Punchlister</strong> · ref. ${dispute.number}</div>
    </div>
  </div>
</body>
</html>`;
}

async function sendViaMailgun({ to, from, subject, text, html }) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');
  }

  const body = new URLSearchParams({ from, to, subject, text, html });

  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Mailgun send failed (${response.status}): ${detail}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { disputeId, recipientEmail } = req.body;
  if (!disputeId) return res.status(400).json({ error: 'disputeId required' });

  const { data: dispute, error: dispErr } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .single();
  if (dispErr || !dispute) return res.status(404).json({ error: 'Dispute not found' });

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, city, project_number')
    .eq('id', dispute.project_id)
    .single();
  if (projErr || !project) return res.status(404).json({ error: 'Project not found' });

  const { data: points } = await supabase
    .from('dispute_points')
    .select('*')
    .eq('dispute_id', disputeId)
    .order('created_at', { ascending: true });

  const draftedPoints = (points || []).filter(p => p.draft_response?.trim());
  if (!draftedPoints.length) {
    return res.status(400).json({ error: 'No drafted points to send' });
  }

  const to      = recipientEmail || dispute.sender_email;
  const from    = process.env.MAILGUN_FROM_EMAIL || `noreply@${process.env.MAILGUN_DOMAIN}`;
  const subject = `Antwoord op betwisting ${dispute.number}: ${dispute.subject || 'uw klacht'}`;
  const text    = buildEmailBody({ dispute, project, points: draftedPoints });
  const html    = buildEmailHtml({ dispute, project, points: draftedPoints });

  if (!to) {
    return res.status(400).json({ error: 'No recipient email — set recipientEmail in request or dispute.sender_email in DB' });
  }

  try {
    await sendViaMailgun({ to, from, subject, text, html });

    const sentAt = new Date().toISOString();
    await supabase
      .from('disputes')
      .update({ status: 'sent', sent_at: sentAt, updated_at: sentAt })
      .eq('id', disputeId);

    console.log('[send-dispute-response] Sent response for', dispute.number, '→', to);
    return res.json({ success: true, sentAt, to });
  } catch (err) {
    console.error('[send-dispute-response] error:', err.message);
    return res.status(500).json({ error: 'Failed to send response', detail: err.message });
  }
}
