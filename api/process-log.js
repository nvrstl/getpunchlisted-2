import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Parse JSON the model returned, with a fallback for the common failure
// modes: stray prose around the object, unescaped quotes inside string
// values, trailing commas. Throws a descriptive error (including a preview
// of the raw text) when all attempts fail — the caller surfaces this to
// the UI instead of a cryptic "Expected ',' or '}'".
function parseLooseJson(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // Pull out the outermost {...} block in case the model added prose.
  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;

  // Remove trailing commas before } or ]
  const stripped = candidate.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  // Last resort: try escaping bare double-quotes that appear inside what
  // looks like a string value. This catches the most common Claude failure
  // (an unescaped quote inside body/subject text).
  const escaped = stripped.replace(
    /("(?:subject|body|description|reasoning|rationale)"\s*:\s*")((?:[^"\\]|\\.)*?)("(?=\s*[,}]))/g,
    (_m, head, inner, tail) => head + inner.replace(/(?<!\\)"/g, '\\"') + tail,
  );
  try { return JSON.parse(escaped); } catch (err) {
    const preview = raw.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Model returned invalid JSON (${err.message}). Raw preview: ${preview}…`);
  }
}

export async function processNote(note, location = '', { contacts = [], contextItems = [], projectName = '', senderName = '' } = {}) {
  const contactsBlock = contacts.length
    ? contacts.map(c => `· ${c.name}${c.role ? ` (${c.role})` : ''}${c.email ? ` — ${c.email}` : ''}`).join('\n')
    : '(geen contacten geregistreerd)';

  const offerteBlock = contextItems
    .filter(i => ['quote', 'contract', 'lastenboek'].includes(i.category))
    .slice(0, 4)
    .map(i => `[${i.category?.toUpperCase()} — ${i.title}]\n${(i.content || '').slice(0, 1200)}`)
    .join('\n\n---\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2600,
    messages: [{
      role: 'user',
      content: `Je bent Punchlister, de admin-assistent van een Belgische projectleider in de bouw. Je krijgt een memo van een werfbezoek. Lever:
(1) gestructureerde extractie van de memo,
(2) per-werkpunt classificatie tegen de getekende offerte,
(3) een lijst aanbevolen "outputs" — concrete, klaargemaakte berichten die de PM met één klik kan versturen, gericht naar de juiste contactpersonen, met de juiste toon.

Return ONLY valid JSON — no markdown, no code fences.

PROJECT: ${projectName || '(naam onbekend)'}
NOTE: "${note}"
PROVIDED LOCATION: "${location || ''}"

CONTACTEN OP HET PROJECT:
${contactsBlock}

OFFERTE / CONTRACT / LASTENBOEK:
${offerteBlock || '(geen documenten geüpload — classificatie valt terug op "twijfel")'}

Return exactly:
{
  "summary": "1-2 zinnen Nederlands",
  "type": "delay|safety|progress|material|rfi|dispute|general",
  "disputeTypes": [],
  "flags": ["short tag", "short tag"],
  "impact": "none|schedule|cost|safety",
  "actionRequired": true | false,
  "suggestRFI": true | false,
  "extractedLocation": null | "string",
  "extractedDate": null | "YYYY-MM-DD",
  "label": "één kort Nederlands vaktechnisch label van 1-2 woorden dat het onderwerp van de memo dekt",
  "workpoints": [
    {
      "description": "concrete zin in NL",
      "type": "general|delay|safety|progress|material|rfi|dispute",
      "amount": null | number (EUR),
      "responsible": null | "naam of rol",
      "classification": "in_scope|meerwerk|twijfel",
      "reasoning": "max 2 zinnen NL waarom"
    }
  ],
  "recommendedOutputs": [
    {
      "type":           "reminder|pv_mail|werfmail|self_reminder|meerwerk_offerte|briefing",
      "recipientRole":  null | "Klant|Architect|Schilder|Loodgieter|Elektricien|Bouwheer|Onderaannemer|Leverancier|Andere",
      "recipientName":  null | "exacte naam uit CONTACTEN als match",
      "subject":        "korte concrete subject NL",
      "body":           "volledig opgesteld bericht NL, klaar te versturen, sluit af met op een eigen regel 'Met vriendelijke groeten,' en daaronder de naam '${senderName || '<jouw naam>'}'",
      "tone":           "chasing|courtesy|formal|briefing|self",
      "urgency":        "urgent|normal|low",
      "dueAt":          null | "YYYY-MM-DD (alleen voor self_reminder of reminder)",
      "rationale":      "1 zin NL — waarom dit bericht zinvol is"
    }
  ]
}

REGELS — label:
- Eén kort label van 1-2 Nederlandse woorden dat het hoofdthema dekt (bv. "Beton", "Elektriciteit", "Loodgieterij", "HVAC", "Schrijnwerk", "Schilderwerk", "Dakwerken", "Veiligheid", "Planning", "Coördinatie", "Materiaal", "Meerwerk", "Oplevering"). Geen zinnen, geen leestekens. Kies het meest relevante onderwerp; gebruik consistente termen over memo's heen.

REGELS — werkpunten:
- Splits 1–5 onderscheiden punten per memo, geen samenvoegingen.
- amount: alleen als concreet bedrag genoemd; anders null.
- responsible: naam (uit CONTACTEN) of rol; anders null.
- classification: in_scope = expliciet/impliciet in offerte; meerwerk = duidelijk buiten scope; twijfel = onduidelijk of geen offerte.

REGELS — recommendedOutputs (CRUCIAAL — dit is de kern van het product):
- Genereer 1 tot 3 outputs, NIET meer. Kwaliteit boven kwantiteit.
- Kies recipientRole gebaseerd op de inhoud:
  · onderaannemer mist deadline → "reminder" naar de juiste vakman (Elektricien, Loodgieter, …)
  · meerwerk besproken → "meerwerk_offerte" naar Klant/Bouwheer
  · vertraging die de klant raakt, of beslissing/observatie die je schriftelijk wil vastleggen → "pv_mail" (paper-trail: schriftelijke bevestiging voor het dossier) met courtesy toon naar Klant/Bouwheer
  · interne actie nodig → "briefing" of "werfmail" naar de werfploeg
  · open vraag, antwoord verwacht → ook "self_reminder" met dueAt 2-5 dagen later om op te volgen
- recipientName: vul in als één van de CONTACTEN past op de rol; anders null.
- subject: concreet, geen "Werfverslag <datum>" tenzij het écht een algemene update is.
- body: schrijf het bericht VOLLEDIG uit (3-8 zinnen), in juiste toon:
  · chasing: zakelijk maar duidelijk; benoem de gemiste deadline en vraag concrete nieuwe ETA.
  · courtesy: heads-up zonder verwijt; benoem de impact en mitigatie.
  · formal: voor paper-trail mails en meerwerk-offertes; bevestigend, datum + plek + actie.
  · briefing: kort lijstje voor de werfploeg.
  · self: reminder naar jezelf, beknopt.
- urgency: urgent als deadline al verstreken / safety; normal voor courtesy; low voor info.
- dueAt: alleen invullen voor self_reminder (3-7 dagen) of als de body expliciet een nieuwe deadline noemt.
- rationale: 1 zin waarom dit bericht zinvol is.

Wees beknopt. Wees in het Nederlands. Bij echte twijfel over recipientRole: laat null en de PM kiest.`,
    }],
  });

  const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed = parseLooseJson(raw);
  if (!Array.isArray(parsed.disputeTypes))       parsed.disputeTypes       = [];
  if (!Array.isArray(parsed.workpoints))         parsed.workpoints         = [];
  if (!Array.isArray(parsed.recommendedOutputs)) parsed.recommendedOutputs = [];

  // Normalize auto-generated label: 1-2 meaningful words, no connectors or trailing punctuation.
  if (typeof parsed.label === 'string') {
    const words = parsed.label
      .trim()
      .split(/\s+/)
      .filter(w => !/^[&/\-—–.,;:!?+|]+$/.test(w)) // drop standalone connectors
      .slice(0, 2);
    const cleaned = words.join(' ').replace(/[&/\-—–.,;:!?+|]+$/, '').trim();
    parsed.label = cleaned.length ? cleaned : null;
  } else {
    parsed.label = null;
  }

  parsed.workpoints = parsed.workpoints.map(wp => ({
    description:    String(wp.description || '').trim(),
    type:           wp.type || 'general',
    amount:         wp.amount != null ? Number(wp.amount) : null,
    responsible:    wp.responsible || null,
    classification: wp.classification || 'twijfel',
    reasoning:      wp.reasoning || '',
  })).filter(wp => wp.description.length > 0);

  parsed.recommendedOutputs = parsed.recommendedOutputs.slice(0, 4).map(o => ({
    type:           o.type           || 'pv_mail',
    recipientRole:  o.recipientRole  || null,
    recipientName:  o.recipientName  || null,
    subject:        String(o.subject || '').trim(),
    body:           String(o.body || '').trim(),
    tone:           o.tone           || 'formal',
    urgency:        o.urgency        || 'normal',
    dueAt:          o.dueAt          || null,
    rationale:      o.rationale      || '',
  })).filter(o => o.subject.length > 0 || o.body.length > 0);

  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { note, location, contacts, contextItems, projectName, senderName } = req.body;
  if (!note) return res.status(400).json({ success: false, error: 'Note is required' });
  try {
    const data = await processNote(note, location, { contacts, contextItems, projectName, senderName });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[process-log]', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
