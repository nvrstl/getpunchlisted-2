// Project Q&A chat. Loads project context (offerte / contacts / recent memos / sent mails)
// and asks Claude to answer a user question grounded in that context.
//
// POST /api/project-chat
// Body: { projectId, message, history?: [{role: 'user'|'assistant', content}] }

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { retrieveRelevantChunks, groupChunksByContext } from './_lib/retrieval.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Dutch + English stopwords. Short list — drop function words so keyword
// matching focuses on the topic of the question.
const STOPWORDS = new Set([
  'de','het','een','en','of','van','op','in','aan','dat','is','niet','met','voor',
  'door','te','om','wat','wie','waar','hoe','wanneer','welke','welk','dan','maar',
  'als','ook','er','zijn','was','wordt','worden','heeft','hebben','had','kan','kunnen',
  'moet','moeten','mag','mogen','wil','willen','zou','zouden','staat','staan',
  'the','a','an','and','or','of','on','in','at','to','for','from','by','with','that',
  'is','are','was','were','be','been','being','has','have','had','do','does','did',
  'will','would','should','could','may','might','can','this','these','those','it',
]);

// When raw_text is bigger than the per-doc budget, return:
//   1. ALWAYS the first ~10k chars (TOC/intro, helps with overview questions)
//   2. PLUS the highest-scoring keyword chunks for the question
// concatenated in original document order with [...] separators.
function relevantSlice(rawText, question, budget) {
  if (!rawText) return '';
  if (rawText.length <= budget) return rawText;

  // Always include the head — table of contents + intro live there.
  const HEAD = Math.min(rawText.length, Math.min(10000, Math.floor(budget * 0.3)));
  const headSlice = rawText.slice(0, HEAD);
  let remaining = budget - HEAD;

  // Score chunks from the REST of the document
  const tail = rawText.slice(HEAD);
  if (tail.length <= remaining) return rawText.slice(0, budget);

  const words = (question || '').toLowerCase().match(/[\p{L}]{3,}/gu) || [];
  // Stem with prefix matching: drop common Dutch plural/diminutive endings
  // so "stopcontacten" → prefix "stopcontact" also matches the singular
  // and compounds like "stopcontactdoos" in the document text.
  const stem = (w) => {
    const stripped = w.replace(/(ten|den|sen|en|s|n|e)$/, '');
    return stripped.length >= 4 ? stripped : w;
  };
  const keywords = [...new Set(
    words.filter(w => !STOPWORDS.has(w)).map(stem).filter(k => k.length >= 4)
  )];

  const CHUNK = 2000;
  const STEP  = 1600;            // 400-char overlap so clauses on the seam aren't lost
  const chunks = [];
  for (let i = 0; i < tail.length; i += STEP) {
    const text = tail.slice(i, i + CHUNK);
    if (!text.trim()) continue;
    let score = 0;
    if (keywords.length) {
      const lower = text.toLowerCase();
      for (const k of keywords) {
        // Prefix match (no trailing \b) — "\bstopcontact" catches singular,
        // plural, and compound forms in one pass.
        const matches = lower.match(new RegExp(`\\b${k}`, 'g'));
        if (matches) score += matches.length;
      }
    }
    chunks.push({ start: HEAD + i, text, score });
  }

  const sorted = [...chunks].sort((a, b) => b.score - a.score);
  const picked = [];
  let total = 0;
  for (const c of sorted) {
    // If question yielded keywords but this chunk doesn't match AND we
    // already have relevant ones, stop. If no keywords (generic question),
    // pick chunks in original order until budget fills.
    if (keywords.length && c.score === 0 && picked.some(p => p.score > 0)) break;
    if (total + c.text.length > remaining) continue;
    picked.push(c);
    total += c.text.length;
    if (total >= remaining * 0.95) break;
  }

  picked.sort((a, b) => a.start - b.start);
  const parts = [headSlice];
  let lastEnd = HEAD;
  for (const c of picked) {
    if (c.start > lastEnd) parts.push('[…]');
    parts.push(c.text);
    lastEnd = c.start + c.text.length;
  }
  return parts.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { projectId, message, history = [] } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    // ── Gather project memory ──────────────────────────────────────────
    // field_logs is the canonical "inbox" — everything that arrives in the
    // app (voice notes, inbound emails, manual logs, WhatsApp) is a row here.
    // Pull a generous number (200) and trim each body to keep the prompt
    // under control; oldest entries beyond that cap are dropped.
    const [{ data: project }, { data: ctx }, { data: contacts }, { data: logs }] = await Promise.all([
      supabase.from('projects').select('id, name, city, project_number, status, client_name, project_manager').eq('id', projectId).maybeSingle(),
      supabase.from('project_context').select('category, title, content, raw_text, source').eq('project_id', projectId).order('created_at', { ascending: false }).limit(12),
      supabase.from('project_contacts').select('name, role, email, phone').eq('project_id', projectId),
      supabase.from('field_logs')
        .select('id, processed_summary, raw_note, type, location, created_at, source, subject, treated')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Prefer raw_text (the verbatim PDF/email body) over content (the
    // AI-generated summary) so the chat can quote exact clauses. Falls back
    // to content for items uploaded before raw_text existed. Label each
    // block explicitly so the model knows whether it has full text or
    // only a summary — without this it hedges ("text extraction not done").
    //
    // ── Document retrieval ─────────────────────────────────────────────────
    // Belt-and-suspenders: run BOTH retrievals and union the results.
    //   - Vector search: semantic similarity (catches "merken stopcontacten"
    //     even when the question wording doesn't exactly match the document)
    //   - Keyword slice: always includes TOC/intro + paragraphs matching
    //     the question terms (catches brand names, article numbers,
    //     specific keywords vectors might miss)
    // For each document we concatenate the keyword head + any extra vector
    // chunks that aren't already inside it. Budget per doc adapts to count.
    const docs = ctx || [];
    const perDocCap = docs.length
      ? Math.max(8000, Math.min(120000, Math.floor(120000 / docs.length)))
      : 0;

    const vectorChunks = await retrieveRelevantChunks(supabase, {
      projectId,
      question: message,
      matchCount: 50,
    });
    const vectorByCtx = new Map();
    if (vectorChunks?.length) {
      for (const ch of vectorChunks) {
        if (!vectorByCtx.has(ch.project_context_id)) vectorByCtx.set(ch.project_context_id, []);
        vectorByCtx.get(ch.project_context_id).push(ch);
      }
    }

    const ctxBlock = docs.map(i => {
      const hasRaw = !!(i.raw_text && i.raw_text.length > 50);
      const full   = hasRaw ? i.raw_text : (i.content || '');
      const kwBody = relevantSlice(full, message, Math.floor(perDocCap * 0.7));

      // Append any vector chunks not already inside the keyword body.
      const semChunks = (vectorByCtx.get(i.id) || [])
        .filter(c => !kwBody.includes(c.text.slice(0, 80)));
      const semBudget = perDocCap - kwBody.length;
      const semPicked = [];
      let semTotal = 0;
      for (const c of semChunks) {
        if (semTotal + c.text.length > semBudget) break;
        semPicked.push(c.text);
        semTotal += c.text.length;
      }

      const kind     = hasRaw ? 'VOLLEDIGE TEKST' : 'SAMENVATTING';
      const haveVec  = semPicked.length > 0;
      const vecCount = (vectorByCtx.get(i.id) || []).length;
      const sizeHint = hasRaw
        ? ` · ${(full.length / 1000).toFixed(0)}k karakters totaal — ${haveVec ? `${vecCount} semantisch + ` : ''}vraag-relevante fragmenten getoond`
        : '';
      const head = `[${i.category?.toUpperCase()} — ${i.title}${i.source ? ` · ${i.source}` : ''} — ${kind}${sizeHint}]`;

      const body = semPicked.length
        ? `${kwBody}\n[Aanvullende semantisch-relevante fragmenten:]\n${semPicked.join('\n[…]\n')}`
        : kwBody;
      return `${head}\n${body}`;
    }).join('\n\n');

    const contactsBlock = (contacts || []).length
      ? (contacts || []).map(c => `· ${c.name}${c.role ? ` (${c.role})` : ''}${c.email ? ` — ${c.email}` : ''}${c.phone ? ` — ${c.phone}` : ''}`).join('\n')
      : '(geen contacten geregistreerd)';

    // Build the inbox block. Each entry trimmed to keep the prompt bounded
    // (~400 chars/log × 200 logs ≈ 80k chars upper bound — safely inside
    // Haiku's context). Prefers processed_summary, falls back to raw_note.
    const logsBlock = (logs || []).map(l => {
      const date = new Date(l.created_at).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
      const src  = l.source ? ` [${l.source}]` : '';
      const loc  = l.location ? ` · ${l.location}` : '';
      const subj = l.subject ? ` · "${l.subject}"` : '';
      const flag = l.treated ? '' : ' · ONBEHANDELD';
      const body = (l.processed_summary || l.raw_note || '').slice(0, 400);
      // Prefix each item with its id so the model can cite it back.
      return `[id:${l.id}] ── ${date}${src}${loc}${subj}${flag} ──\n${body}`;
    }).join('\n\n');

    const systemPrompt = `Je bent Punchlister, de admin-assistent van een Belgische bouwondernemer. Je beantwoordt vragen over één specifiek project. Antwoord beknopt, in het Nederlands, en altijd grond je antwoord in de project-data hieronder. Als iets niet in de data staat, zeg dat expliciet ("Dit staat niet in het projectgeheugen") in plaats van te gokken.

PROJECT
· Naam: ${project.name}
${project.project_number ? `· Nummer: ${project.project_number}\n` : ''}${project.city ? `· Locatie: ${project.city}\n` : ''}${project.client_name ? `· Klant: ${project.client_name}\n` : ''}${project.project_manager ? `· PM: ${project.project_manager}\n` : ''}· Status: ${project.status || 'active'}

CONTACTEN
${contactsBlock}

DOCUMENT-INVENTARIS (alle ${docs.length} documenten in het projectgeheugen — gebruik deze lijst om te bepalen WELKE documenten er zijn, ongeacht welke fragmenten hieronder getoond zijn):
${docs.length
  ? docs.map(d => `· ${d.title} [${d.category || 'document'}] — ${d.raw_text ? `${(d.raw_text.length / 1000).toFixed(0)}k karakters` : `samenvatting (${(d.content || '').length} karakters)`}${d.source ? ` · bron: ${d.source}` : ''}`).join('\n')
  : '(nog geen documenten geüpload)'}

CONTEXT-DOCUMENTEN (vraag-relevante fragmenten uit bovenstaande documenten — niet de volledige tekst van elk doc, alleen wat semantisch en op trefwoord matcht met de vraag)
${ctxBlock || '(geen documenten geüpload)'}

DOCUMENT-QUOTING (BELANGRIJK — lees voor je antwoordt):
Elke documentkop eindigt op "— VOLLEDIGE TEKST" of "— SAMENVATTING", optioneel met een groottehint zoals "230k karakters totaal — 8 semantisch + vraag-relevante fragmenten getoond".

Het document IS volledig opgeslagen in het projectgeheugen. Wat je in dit gesprek krijgt is een automatische selectie van inhoudstafel + de meest relevante passages voor déze specifieke vraag.

VERBODEN antwoorden — schrijf deze NOOIT:
✗ "Het volledige document is niet beschikbaar in mijn geheugen"
✗ "De rest van het document is niet geëxtraheerd"
✗ "Ik heb alleen het begin / een deel van het document"
✗ "Het document is nog niet volledig verwerkt"
✗ "Je zou de volledige versie nodig hebben"

TOEGESTANE antwoorden wanneer je de gevraagde info NIET ziet in de fragmenten:
✓ "Die specifieke passage zit niet in de getoonde fragmenten. Probeer een specifieker trefwoord (bv. een artikelnummer of merknaam) zodat de juiste sectie wordt opgehaald."
✓ Als de vraag een merk/leverancier is: "Ik zie merkverwijzingen X, Y en Z in de getoonde fragmenten, maar niets specifiek over <vraag>."
✓ Citeer wel altijd wat je WEL ziet — geef de gebruiker iets om mee verder te kunnen.

Bij VOLLEDIGE TEKST mag je letterlijk citeren met aanhalingstekens en bronvermelding. Voorbeeld: "In het lastenboek staat: 'levering uiterlijk 15 mei' (bron: lastenboek-v3.pdf)". Verzin nooit een citaat.

Bij SAMENVATTING werk je met de samenvatting zelf — beweer NOOIT dat "de tekst nog niet geëxtraheerd is". Begin met "Volgens de samenvatting van <titel>...".

INBOX — alle binnenkomende berichten (voice, e-mail, manuele log, WhatsApp; max 200 recent)
${logsBlock || '(nog geen inbox-items)'}

Houd je antwoorden kort. Verwijs naar specifieke memo's of documenten als bewijs.

CITATIES — VERPLICHT:
Wanneer je een specifiek inbox-item noemt (memo, e-mail, voicenote, WhatsApp), voeg dan ONMIDDELLIJK na de zin de marker [memo:<id>] toe, met het id uit de [id:...] prefix van dat item hierboven. Voorbeeld: "Op 14 mei meldde de bouwheer een vertraging.[memo:2d88d345-1de6-466e-88cd-51ef9257b81a]". Gebruik enkel echte id's die in het PROJECTGEHEUGEN voorkomen — verzin niets. Geen markdown headers, gebruik korte alinea's.`;

    const messages = [
      ...history.filter(m => m && m.role && m.content).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content),
      })),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    });

    const reply = response.content?.[0]?.text || '';
    return res.json({ success: true, reply });
  } catch (err) {
    console.error('[project-chat]', err);
    return res.status(500).json({ error: err.message });
  }
}
