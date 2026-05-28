// POST /api/embed-context  { contextId }
// Chunks the project_context row's raw_text (or content as fallback),
// generates embeddings via OpenAI, and inserts into context_chunks.
// Re-embedding the same row replaces existing chunks. Idempotent.

import { supabaseAdmin, authenticate } from './_lib/auth.js';
import { chunkText } from './_lib/chunking.js';
import { embedTexts } from './_lib/embeddings.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await authenticate(req, res);
  if (!auth) return;

  const { contextId } = req.body || {};
  if (!contextId) return res.status(400).json({ success: false, error: 'contextId required' });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY not set on server — embeddings disabled. Set it in Vercel env vars (Production scope) and redeploy.',
    });
  }

  try {
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('project_context')
      .select('id, project_id, raw_text, content, title')
      .eq('id', contextId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row)     return res.status(404).json({ success: false, error: 'context row not found' });

    const source = row.raw_text || row.content || '';
    const chunks = chunkText(source);
    if (chunks.length === 0) {
      return res.json({ success: true, chunkCount: 0, note: 'empty source, nothing to embed' });
    }

    const embeddings = await embedTexts(chunks);

    // Replace any existing chunks for this context row so re-embedding is safe.
    const { error: delErr } = await supabaseAdmin
      .from('context_chunks')
      .delete()
      .eq('project_context_id', contextId);
    if (delErr) console.warn('[embed-context] delete old chunks:', delErr.message);

    const rows = chunks.map((text, i) => ({
      project_context_id: contextId,
      project_id:         row.project_id,
      chunk_idx:          i,
      text,
      embedding:          embeddings[i],
    }));
    const { error: insErr } = await supabaseAdmin.from('context_chunks').insert(rows);
    if (insErr) {
      // The most common cause of an insert error on context_chunks is the
      // pgvector migration not being applied. Surface it clearly.
      if (/relation .* context_chunks .* does not exist/i.test(insErr.message)) {
        throw new Error('context_chunks table not found — apply supabase/add_context_chunks.sql migration first');
      }
      throw new Error(insErr.message);
    }

    return res.json({
      success:    true,
      title:      row.title,
      chunkCount: chunks.length,
      totalChars: source.length,
    });
  } catch (err) {
    console.error('[embed-context]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
