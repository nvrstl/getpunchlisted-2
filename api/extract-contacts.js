// POST /api/extract-contacts  { text }
// Takes pasted free-form text (email signatures, vCard dumps, contact lists,
// meeting notes, etc.) and uses Claude to pull out structured contact rows.
//
// Returns: { success, contacts: [{ name, email, phone, role, company }] }
// The frontend shows the parsed rows in a review modal so the user can
// trim/edit before saving — no contacts are inserted automatically.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ success: false, error: 'text required' });

  // Truncate so a wall-of-text paste doesn't burn tokens unnecessarily.
  const excerpt = text.length > 20000 ? text.slice(0, 20000) : text;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Je krijgt een blok tekst van een Belgische projectleider in de bouw. Hierin staan één of meerdere contactpersonen (klanten, leveranciers, architecten, onderaannemers, …). Haal elke aparte persoon eruit en geef ze terug als gestructureerde data.

TEKST:
${excerpt}

Return ONLY valid JSON — no markdown, no code blocks, no prose:
{
  "contacts": [
    {
      "name":    "Voornaam Achternaam",
      "email":   "iemand@firma.be" of null,
      "phone":   "+32 ... " of null (Belgisch formaat indien herkenbaar, anders zoals het er staat),
      "role":    "Architect | Bouwheer | Klant | Aannemer | Onderaannemer | Loodgieter | Elektricien | Schilder | Leverancier | Andere" of null,
      "company": "Bedrijfsnaam" of null
    }
  ]
}

Regels:
- Eén entry per persoon. Als hetzelfde persoon meerdere keren voorkomt, één entry met de samengevoegde info.
- Geen verzonnen data: alleen wat letterlijk in de tekst staat.
- Als de tekst geen contacten bevat, geef terug: { "contacts": [] }.
- Voor 'name' verkies "Voornaam Achternaam" boven enkel een achternaam of voornaam. Als alleen één naam beschikbaar, gebruik die.
- Voor 'role' kies de meest specifieke match uit de lijst. Als niets past, gebruik "Andere".`
      }]
    });

    const raw = response.content?.[0]?.text?.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Try to find first {...} block in case the model added prose.
      const match = raw?.match?.(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error(`Model returned invalid JSON: ${raw?.slice?.(0, 120)}`);
    }

    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
    return res.json({ success: true, contacts });
  } catch (err) {
    console.error('[extract-contacts]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
