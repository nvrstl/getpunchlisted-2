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
  const keywords = [...new Set(words.filter(w => !STOPWORDS.has(w)))];

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
        const matches = lower.match(new RegExp(`\\b${k}\\b`, 'g'));
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
    // ── Document retrieval strategy ────────────────────────────────────────
    // 1. Vector search across context_chunks (semantic, scales to 5+ huge
    //    contracts). Requires the add_context_chunks.sql migration applied
    //    and OPENAI_API_KEY set. Returns null on either failure.
    // 2. If vector search returns nothing useful (no embeddings yet, or no
    //    chunks above the relevance bar), fall back to relevantSlice which
    //    does keyword-based chunk selection over raw_text per document.
    const docs = ctx || [];
    let ctxBlock = '';
    const vectorChunks = await retrieveRelevantChunks(supabase, {
      projectId,
      question: message,
      matchCount: 30,
    });

    if (vectorChunks && vectorChunks.length > 0) {
      const grouped = groupChunksByContext(vectorChunks, docs);
      ctxBlock = grouped.map(({ row, chunks, bestScore }) => {
        const kind = row.raw_text ? 'VOLLEDIGE TEKST' : 'SAMENVATTING';
        const sizeNote = row.raw_text
          ? ` · ${(row.raw_text.length / 1000).toFixed(0)}k karakters totaal — ${chunks.length} semantisch-relevante fragmenten getoond (similariteit ${(bestScore * 100).toFixed(0)}%)`
          : '';
        const head = `[${row.category?.toUpperCase()} — ${row.title}${row.source ? ` · ${row.source}` : ''} — ${kind}${sizeNote}]`;
        const body = chunks.map(c => c.text).join('\n[…]\n');
        return `${head}\n${body}`;
      }).join('\n\n');
    } else {
      // Keyword fallback. Adaptive per-doc cap: 1 doc → 120k chars; 2 → 60k each, etc.
      const perDocCap = docs.length
        ? Math.max(8000, Math.min(120000, Math.floor(120000 / docs.length)))
        : 0;
      ctxBlock = docs.map(i => {
        const hasRaw = !!(i.raw_text && i.raw_text.length > 50);
        const full   = hasRaw ? i.raw_text : (i.content || '');
        const body   = relevantSlice(full, message, perDocCap);
        const kind   = hasRaw ? 'VOLLEDIGE TEKST' : 'SAMENVATTING';
        const truncated = hasRaw && full.length > perDocCap;
        const sizeHint = truncated
          ? ` · ${(full.length / 1000).toFixed(0)}k karakters totaal — inhoudstafel + ${((body.length - 10000) / 1000).toFixed(0)}k aan vraag-relevante fragmenten getoond`
          : (hasRaw ? ` · volledig in geheugen` : '');
        const head = `[${i.category?.toUpperCase()} — ${i.title}${i.source ? ` · ${i.source}` : ''} — ${kind}${sizeHint}]`;
        return `${head}\n${body}`;
      }).join('\n\n');
    }

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

CONTEXT-DOCUMENTEN (volledige tekst van offerte, lastenboek, contract, e-mails)
${ctxBlock || '(geen documenten geüpload)'}

DOCUMENT-QUOTING:
Elke documentkop eindigt op "— VOLLEDIGE TEKST" of "— SAMENVATTING", optioneel gevolgd door een groottehint zoals "230k karakters totaal — inhoudstafel + 110k aan vraag-relevante fragmenten getoond".

- Bij VOLLEDIGE TEKST mag je letterlijk citeren met aanhalingstekens en bronvermelding. Voorbeeld: "In het lastenboek staat: 'levering uiterlijk 15 mei' (bron: lastenboek-v3.pdf)". Verzin nooit een citaat.
- Bij SAMENVATTING antwoord je op basis van de samenvatting zelf — beweer NOOIT dat "de tekst nog niet geëxtraheerd is". De samenvatting IS wat je hebt; werk ermee. Begin je antwoord met "Volgens de samenvatting van <titel>...".
- Wanneer de hint zegt dat "vraag-relevante fragmenten getoond" zijn: je hebt het VOLLEDIGE document tot je beschikking — er zijn enkel automatisch de meest relevante stukken voor déze vraag geselecteerd plus de inhoudstafel. Beweer NOOIT dat je "alleen het begin" of "alleen een deel" hebt. Als de gevraagde inhoud niet in de getoonde fragmenten staat, antwoord met "Ik zie die specifieke passage niet in de relevante fragmenten — probeer een meer specifieke vraag (bv. een artikelnummer of trefwoord)" in plaats van te zeggen dat het document onvolledig is.

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
