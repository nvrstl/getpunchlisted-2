// Vector retrieval over context_chunks. Embeds the user's question once,
// then runs a cosine-similarity search per project. Returns the top-K
// matching chunks grouped by their parent project_context row so the chat
// prompt can show them under the correct document header.

import { embedOne } from './embeddings.js';

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

  const { data, error } = await supabase.rpc('match_context_chunks', {
    p_project_id:  projectId,
    p_embedding:   queryEmbedding,
    p_match_count: POOL,
  });
  if (error) {
    console.warn('[retrieval] match_context_chunks rpc failed:', error.message);
    return null;
  }
  const all = data || [];
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
