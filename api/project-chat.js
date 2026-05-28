// Project Q&A chat. Loads project context (offerte / contacts / recent memos / sent mails)
// and asks Claude to answer a user question grounded in that context.
//
// POST /api/project-chat
// Body: { projectId, message, history?: [{role: 'user'|'assistant', content}] }

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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

// When raw_text is bigger than the per-doc budget, slice into overlapping
// chunks, score each by how many question keywords it contains, and return
// the top-scoring chunks in original order. Falls back to the first N chars
// if the question yields no useful keywords or no chunks match.
function relevantSlice(rawText, question, budget) {
  if (!rawText) return '';
  if (rawText.length <= budget) return rawText;

  const words = (question || '').toLowerCase().match(/[\p{L}]{3,}/gu) || [];
  const keywords = [...new Set(words.filter(w => !STOPWORDS.has(w)))];
  if (keywords.length === 0) return rawText.slice(0, budget);

  const CHUNK = 2000;
  const STEP  = 1600;            // 400-char overlap so clauses on the seam aren't lost
  const chunks = [];
  for (let i = 0; i < rawText.length; i += STEP) {
    const text = rawText.slice(i, i + CHUNK);
    if (!text.trim()) continue;
    const lower = text.toLowerCase();
    let score = 0;
    for (const k of keywords) {
      const matches = lower.match(new RegExp(`\\b${k}\\b`, 'g'));
      if (matches) score += matches.length;
    }
    chunks.push({ start: i, text, score });
  }

  const sorted = [...chunks].sort((a, b) => b.score - a.score);
  const picked = [];
  let total = 0;
  for (const c of sorted) {
    // Stop once we hit no-score chunks AND already have something relevant.
    if (c.score === 0 && picked.some(p => p.score > 0)) break;
    if (total + c.text.length > budget) continue;
    picked.push(c);
    total += c.text.length;
    if (total >= budget * 0.95) break;
  }
  if (picked.length === 0) return rawText.slice(0, budget);

  // Original document order with separators so the model knows chunks aren't contiguous.
  picked.sort((a, b) => a.start - b.start);
  return picked.map(c => c.text).join('\n[…]\n');
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
    // Adaptive per-doc cap: total document budget is ~60k chars across all
    // docs. 1 doc gets up to 50k, 2 → 30k each, 3 → 20k, etc. For docs that
    // exceed their cap, relevantSlice scores chunks by question keywords
    // and returns the most relevant portions (cheap retrieval, no embeddings).
    const docs = ctx || [];
    const perDocCap = docs.length
      ? Math.max(4000, Math.min(50000, Math.floor(60000 / docs.length)))
      : 0;
    const ctxBlock = docs.map(i => {
      const hasRaw = !!(i.raw_text && i.raw_text.length > 50);
      const full   = hasRaw ? i.raw_text : (i.content || '');
      const body   = relevantSlice(full, message, perDocCap);
      const kind   = hasRaw ? 'VOLLEDIGE TEKST' : 'SAMENVATTING';
      const sizeHint = (hasRaw && full.length > perDocCap)
        ? ` · ${(full.length / 1000).toFixed(0)}k chars totaal, relevante fragmenten getoond`
        : '';
      const head = `[${i.category?.toUpperCase()} — ${i.title}${i.source ? ` · ${i.source}` : ''} — ${kind}${sizeHint}]`;
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

CONTEXT-DOCUMENTEN (volledige tekst van offerte, lastenboek, contract, e-mails)
${ctxBlock || '(geen documenten geüpload)'}

DOCUMENT-QUOTING:
Elke documentkop eindigt op "— VOLLEDIGE TEKST" of "— SAMENVATTING".
- Bij VOLLEDIGE TEKST mag je letterlijk citeren met aanhalingstekens en bronvermelding. Voorbeeld: "In het lastenboek staat: 'levering uiterlijk 15 mei' (bron: lastenboek-v3.pdf)". Verzin nooit een citaat.
- Bij SAMENVATTING antwoord je op basis van de samenvatting zelf — beweer NOOIT dat "de tekst nog niet geëxtraheerd is" of "het document nog verwerkt wordt". De samenvatting IS wat je hebt; werk ermee. Begin je antwoord met "Volgens de samenvatting van <titel>..." in plaats van te citeren.

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
