// AI second-pass: given the full inbox of unsent memos + their drafts,
// produce a ranked "what should I do first today?" list with reasons.
//
// POST /api/triage-inbox
// Body: { projectId, memos: [{ id, createdAt, summary, location, type, workpoints, recommendedOutputs }] }
// Returns: { success: true, priorities: [{ memoId, title, reason }] }

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { projectId, memos = [] } = req.body || {};
  if (!Array.isArray(memos) || memos.length === 0) {
    return res.json({ success: true, priorities: [] });
  }

  try {
    const summary = memos.slice(0, 30).map((m, i) => {
      const date = new Date(m.createdAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
      const ageDays = Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86400000);
      const outs = (m.recommendedOutputs || []).filter(o => !o.sentAt);
      const outLine = outs.map(o => `${o.type}${o.recipientName ? ' → ' + o.recipientName : (o.recipientRole ? ' → ' + o.recipientRole : '')}${o.urgency === 'urgent' ? ' [URGENT]' : ''}`).join(', ');
      const wpLine = (m.workpoints || []).map(w => `${w.classification}: ${w.description}`).slice(0, 3).join(' | ');
      return `${i + 1}. [id=${m.id}] ${date} (${ageDays}d oud) — type:${m.type} loc:${m.location || '—'}\n   memo: ${(m.summary || '').slice(0, 140)}\n   workpoints: ${wpLine || '—'}\n   drafts: ${outLine || '—'}`;
    }).join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Je bent Punchlister, de admin-assistent van een Belgische projectleider in de bouw. Hieronder zie je de huidige inbox: open memo's, hun werkpunten en drafts. Bepaal de TOP 5 dingen die de PM vandaag zou moeten doen, in volgorde van impact, en leg uit waarom.

Houd rekening met:
- Verstreken deadlines beats nieuw
- Patronen tussen memo's (3 reminders naar dezelfde persoon = bel hem)
- Risico op kosten/disputen
- Wat snel te versturen is vs wat onderzoek vraagt

INBOX:
${summary}

Return ONLY een JSON array, exact ${Math.min(5, memos.length)} elementen, geordend (eerst belangrijkste):
[
  { "memoId": "id van de memo", "title": "korte concrete actie in NL (max 60 chars)", "reason": "waarom — 1 zin NL" }
]

Geen markdown, geen code-fences, alleen de JSON array.`,
      }],
    });

    const raw = response.content?.[0]?.text?.trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    let priorities = [];
    try { priorities = JSON.parse(raw); } catch { priorities = []; }
    if (!Array.isArray(priorities)) priorities = [];

    return res.json({ success: true, priorities: priorities.slice(0, 5), projectId });
  } catch (err) {
    console.error('[triage-inbox]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
