// Vector + keyword retrieval over context_chunks. Embeds the user's
// question and runs a cosine-similarity search, plus a parallel
// substring-match search for the question's noun-like keywords. Returns
// the union (deduped) so chunks that mention a specific term but don't
// score well semantically (brand names, artikelnummers, code numbers)
// still surface.

import { embedOne } from './embeddings.js';

const STOPWORDS = new Set([
  'de','het','een','en','of','van','op','in','aan','dat','is','niet','met','voor',
  'door','te','om','wat','wie','waar','hoe','wanneer','welke','welk','dan','maar',
  'als','ook','er','zijn','was','wordt','worden','heeft','hebben','had','kan','kunnen',
  'moet','moeten','mag','mogen','wil','willen','zou','zouden','staat','staan',
  'the','a','an','and','or','of','on','in','at','to','for','from','by','with','that',
  'is','are','was','were','be','been','being','has','have','had','do','does','did',
  'will','would','should','could','may','might','can','this','these','those','it',
]);

// Extract noun-like keywords from the question for substring search.
// Stems Dutch plural endings so "stopcontacten" → "stopcontact" matches
// the singular form too.
function extractKeywords(question) {
  const words = (question || '').toLowerCase().match(/[\p{L}]{4,}/gu) || [];
  const stems = words
    .filter(w => !STOPWORDS.has(w))
    .map(w => {
      const stripped = w.replace(/(ten|den|sen|en|s|n|e)$/, '');
      return stripped.length >= 4 ? stripped : w;
    });
  return [...new Set(stems)];
}

export async function retrieveRelevantChunks(supabase, { projectId, question, matchCount = 20 }) {
  if (!projectId || !question?.trim()) return [];
  let queryEmbedding;
  try {
    queryEmbedding = await embedOne(question);
  } catch (err) {
    // OpenAI key missing or rate-limited — caller falls back to keyword retrieval.
    console.warn('[retrieval] embed query failed:', err.message);
    return null;
  }

  // Pull a large pool then rebalance: ensure every document that has chunks
  // contributes at least MIN_PER_DOC of its top matches before the global
  // ranking is allowed to crowd things out. Without this, one big document
  // can dominate the top-50 and squeeze out a smaller doc that's actually
  // most relevant for the question.
  const POOL = Math.max(matchCount * 3, 100);
  const MIN_PER_DOC = 5;

  // Run vector search + keyword substring search in parallel. Keyword
  // search catches chunks that mention a specific term (brand name,
  // article number, exact concept) but might score low semantically.
  const keywords = extractKeywords(question);
  const [vecRes, kwRes] = await Promise.all([
    supabase.rpc('match_context_chunks', {
      p_project_id:  projectId,
      p_embedding:   queryEmbedding,
      p_match_count: POOL,
    }),
    keywords.length
      ? supabase.rpc('search_chunks_by_keywords', {
          p_project_id:  projectId,
          p_keywords:    keywords,
          p_match_count: 40,
        }).then(r => ({ ...r, error: /function .* does not exist/i.test(r.error?.message || '') ? null : r.error, data: r.data || [] }))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (vecRes.error) {
    console.warn('[retrieval] match_context_chunks rpc failed:', vecRes.error.message);
    return null;
  }
  if (kwRes.error) {
    console.warn('[retrieval] search_chunks_by_keywords rpc failed:', kwRes.error.message);
  }

  // Merge: keep highest similarity per chunk_id, prefer the larger value.
  const byId = new Map();
  for (const ch of vecRes.data || []) {
    byId.set(ch.chunk_id, ch);
  }
  for (const ch of kwRes.data || []) {
    const existing = byId.get(ch.chunk_id);
    if (!existing || (ch.similarity || 0) > (existing.similarity || 0)) {
      byId.set(ch.chunk_id, ch);
    }
  }
  const all = [...byId.values()].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  if (all.length <= matchCount) return all;

  // Group by parent context, sort each group by similarity desc.
  const byCtx = new Map();
  for (const ch of all) {
    if (!byCtx.has(ch.project_context_id)) byCtx.set(ch.project_context_id, []);
    byCtx.get(ch.project_context_id).push(ch);
  }
  for (const arr of byCtx.values()) arr.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  // Phase 1: take the top MIN_PER_DOC from every doc.
  const picked = [];
  for (const arr of byCtx.values()) {
    for (const ch of arr.slice(0, MIN_PER_DOC)) picked.push(ch);
  }
  // Phase 2: fill remaining budget with the global top-ranked chunks
  // that aren't already picked.
  const pickedIds = new Set(picked.map(c => c.chunk_id));
  const remaining = all
    .filter(c => !pickedIds.has(c.chunk_id))
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  for (const ch of remaining) {
    if (picked.length >= matchCount) break;
    picked.push(ch);
  }
  return picked;
}

// Group chunks by parent project_context and concatenate them in original
// document order for the prompt. Each group ends up roughly proportional
// to how many of its chunks matched.
export function groupChunksByContext(chunks, contextRows) {
  const byCtx = new Map();
  for (const ch of chunks) {
    if (!byCtx.has(ch.project_context_id)) byCtx.set(ch.project_context_id, []);
    byCtx.get(ch.project_context_id).push(ch);
  }

  const out = [];
  for (const row of contextRows) {
    const matched = byCtx.get(row.id);
    if (!matched?.length) continue;
    // Sort by chunk_idx if present, otherwise leave in match order
    matched.sort((a, b) => (a.chunk_idx ?? 0) - (b.chunk_idx ?? 0));
    out.push({
      row,
      chunks:    matched,
      bestScore: Math.max(...matched.map(c => c.similarity || 0)),
    });
  }
  // Most relevant document first
  out.sort((a, b) => b.bestScore - a.bestScore);
  return out;
}
