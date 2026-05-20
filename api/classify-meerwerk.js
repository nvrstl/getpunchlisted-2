import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Backwards-compatible: accepts either { note } (legacy single-classification mode)
// or { workpoints: [{description, ...}, ...] } (new per-workpoint batch mode).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { note, workpoints, projectId, contextItems = [] } = req.body;

  const items = Array.isArray(workpoints) && workpoints.length > 0
    ? workpoints
    : (note ? [{ description: note }] : []);

  if (items.length === 0) {
    return res.status(400).json({ success: false, error: 'note or workpoints[] required' });
  }

  const offerteItems = (contextItems || []).filter(i => ['quote', 'contract'].includes(i.category));

  // Without an offerte, every workpoint defaults to twijfel — UI uses this to prompt PM to upload.
  if (!offerteItems.length) {
    const fallback = items.map(wp => ({
      description: wp.description,
      classification: 'twijfel',
      reasoning: 'Geen getekende offerte beschikbaar voor classificatie.',
      confidence: 'low',
    }));
    return res.json({
      success: true,
      data: workpoints ? fallback : fallback[0],
      classifications: fallback,
      projectId,
    });
  }

  const offerteContext = offerteItems
    .map(i => `[${i.title}${i.source ? ` — ${i.source}` : ''}]\n${(i.content || '').slice(0, 1500)}`)
    .join('\n\n---\n\n');

  const numberedPoints = items
    .map((wp, idx) => `${idx + 1}. ${wp.description}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Je bent een expert bouwprojectmanager. Voor elk werkpunt hieronder, beoordeel of het binnen de getekende offerte valt of als meerwerk moet worden beschouwd.

GETEKENDE OFFERTE / CONTRACT:
${offerteContext}

WERKPUNTEN:
${numberedPoints}

Return ONLY valid JSON — no markdown, no code blocks. Een JSON array met exact ${items.length} elementen, in dezelfde volgorde als hierboven:

[
  {
    "index": 1,
    "classification": "in_scope" | "meerwerk" | "twijfel",
    "reasoning": "Korte redenering (max 2 zinnen, in het Nederlands)",
    "confidence": "high" | "medium" | "low"
  }
]

Regels per werkpunt:
- "in_scope": het werk is expliciet of impliciet opgenomen in de getekende offerte
- "meerwerk": het werk valt duidelijk buiten de oorspronkelijke scope en vereist een meerwerkaanbieding
- "twijfel": onvoldoende informatie of te ambigu — de PM moet dit beoordelen
- Wees conservatief: bij echte twijfel, kies "twijfel". Niet gokken.`,
      }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    let arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [arr];

    const classifications = items.map((wp, i) => {
      const c = arr[i] || arr.find(x => x.index === i + 1) || {};
      return {
        description:    wp.description,
        classification: c.classification || 'twijfel',
        reasoning:      c.reasoning      || '',
        confidence:     c.confidence     || 'low',
      };
    });

    if (workpoints) {
      // Batch mode
      res.json({ success: true, classifications, projectId });
    } else {
      // Legacy single-classification shape
      res.json({ success: true, data: classifications[0], classifications, projectId });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
