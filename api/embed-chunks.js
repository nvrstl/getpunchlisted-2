// POST /api/embed-chunks { contextId, projectId, chunks: [{idx, text}], replaceExisting? }
// Embeds a batch of pre-chunked text via OpenAI and inserts into
// context_chunks. Stateless and small enough to comfortably fit in a 30s
// Vercel function — the client chunks the full document and loops through
// batches of ~50.
//
// Pass replaceExisting=true on the FIRST batch for a context to clear any
// stale chunks from a previous embedding attempt. Subsequent batches just
// append.

import { supabaseAdmin, authenticate } from './_lib/auth.js';
import { embedTexts } from './_lib/embeddings.js';

const MAX_BATCH_SIZE = 64;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await authenticate(req, res);
  if (!auth) return;

  const { contextId, projectId, chunks, replaceExisting } = req.body || {};
  if (!contextId || !projectId) {
    return res.status(400).json({ success: false, error: 'contextId and projectId required' });
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ success: false, error: 'chunks array required' });
  }
  if (chunks.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ success: false, error: `batch too large (max ${MAX_BATCH_SIZE})` });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY not set on server — set it in Vercel env vars (Production scope) and redeploy.',
    });
  }

  try {
    if (replaceExisting) {
      const { error: delErr } = await supabaseAdmin
        .from('context_chunks')
        .delete()
        .eq('project_context_id', contextId);
      if (delErr) console.warn('[embed-chunks] delete old chunks:', delErr.message);
    }

    // Defence in depth: strip NUL + other invalid control bytes (Postgres
    // TEXT rejects U+0000 with "unsupported Unicode escape sequence" and
    // the JSON wire chokes on a handful of others). The client already
    // does this, but a stray byte from any other code path would tank
    // an entire embedding batch otherwise.
    const sanitize = (s) => (s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const cleaned = chunks.map(c => ({ ...c, text: sanitize(c.text) }));

    const texts = cleaned.map(c => c.text);
    const embeddings = await embedTexts(texts);
    const rows = cleaned.map((c, i) => ({
      project_context_id: contextId,
      project_id:         projectId,
      chunk_idx:          c.idx,
      text:               c.text,
      embedding:          embeddings[i],
    }));

    const { error: insErr } = await supabaseAdmin.from('context_chunks').insert(rows);
    if (insErr) {
      if (/relation .* context_chunks .* does not exist/i.test(insErr.message)) {
        throw new Error('context_chunks table not found — apply supabase/add_context_chunks.sql migration first');
      }
      if (/statement timeout/i.test(insErr.message)) {
        throw new Error('DB statement timeout — apply supabase/add_embedding_timeout.sql to raise service_role statement_timeout to 120s');
      }
      throw new Error(insErr.message);
    }
    return res.json({ success: true, inserted: rows.length });
  } catch (err) {
    console.error('[embed-chunks]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
