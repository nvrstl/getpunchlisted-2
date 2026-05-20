import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { items, recipient } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items required' });
  }

  const firstName = recipient && recipient !== 'Anders' ? recipient.split(' ')[0] : '';

  const drafts = items.map((t, i) => {
    const out = t.output || t;
    const tone = out.tone || 'formal';
    const urg  = out.urgency || 'normal';
    return `[Draft ${i + 1}] (toon: ${tone}, urgentie: ${urg})\nOnderwerp: ${out.subject || ''}\nBody:\n${out.body || ''}`;
  }).join('\n\n---\n\n');

  const system = `Je bent een Belgische projectleider in de bouw. Je krijgt meerdere mail-drafts die naar dezelfde ontvanger gaan. Smelt ze samen tot één vloeiend bericht in het Nederlands — geen genummerde lijst, geen bullets. Schrijf in lopende paragrafen, alsof de PM zelf rustig één mail dicteert.

Regels:
- Begin met "Beste${firstName ? ` ${firstName}` : ''},"
- Eén korte openingszin die zegt dat je meerdere openstaande punten in één bericht verzamelt.
- Voor elk punt: één paragraaf van 2-4 zinnen die de essentie samenvat. Gebruik connectoren (Daarnaast, Verder, Tot slot…) zodat het natuurlijk leest.
- Toon: pas aan op de meest urgente toon onder de drafts (chasing > formal > courtesy).
- Sluit af met een concrete vraag om reactie en "Met vriendelijke groet,".
- Geen ondertekening met naam; de PM tekent zelf.
- Geen subject regel — alleen body.
- Max 220 woorden totaal.`;

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system,
      messages:   [{ role: 'user', content: drafts }],
    });
    const body = response.content?.[0]?.text?.trim();
    if (!body) return res.status(500).json({ success: false, error: 'Empty AI response' });
    res.json({ success: true, body });
  } catch (err) {
    console.error('[merge-emails]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
