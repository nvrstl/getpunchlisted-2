import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { items } = req.body;
  if (!items?.length) return res.json({ success: true, data: { risks: [], obligations: [], watchPoints: [], budgetNotes: [], overallRisk: 'low', summary: 'No context items to analyse.' } });

  const formatted = items.map(i =>
    `[${i.category.toUpperCase()}] ${i.title}: ${i.content}${i.source ? ` (source: ${i.source})` : ''}`
  ).join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
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
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
