import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rfiNumber, rfiTitle, rfiContext, rfiDraft } = req.body;
  if (!rfiTitle) return res.status(400).json({ success: false, error: 'Title is required' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Je bent een Belgische projectingenieur in de bouw. Schrijf een korte, professionele mail in het Nederlands naar de architect/bouwheer met de samenvatting van dit meerwerk en wat gevraagd wordt.

Meerwerknummer: ${rfiNumber || 'TBD'}
Onderwerp: ${rfiTitle}
Context: ${rfiContext || 'Zie onderwerp.'}
${rfiDraft ? `\nDocument:\n${rfiDraft.slice(0, 800)}` : ''}

Schrijf de mail in dit formaat:
Onderwerp: Meerwerk ${rfiNumber || ''} – ${rfiTitle}

(Opening — "Beste [Architect/Team],")
– 2-3 zinnen die het punt helder uitleggen in gewone taal
– één zin met wat je concreet nodig hebt aan antwoord of bevestiging
– beleefde afsluiting "Met vriendelijke groet,"
– geen ondertekening met naam — laat "Met vriendelijke groet," op eigen regel staan

Onder 150 woorden. Platte tekst. Schrijf alles in het Nederlands.`
      }]
    });

    const email = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    res.json({ success: true, email });
  } catch (error) {
    console.error('draft-rfi-email error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
