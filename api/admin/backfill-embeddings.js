// POST /api/admin/backfill-embeddings  { dryRun?: boolean, projectId?: uuid }
// Walks every project_context row that doesn't have chunks yet, chunks +
// embeds it, and inserts into context_chunks. Restricted to platform admins.
//
// Optional body params:
//   dryRun    — true: count what would be embedded but don't call OpenAI
//   projectId — restrict to a single project (useful for testing)

import { supabaseAdmin, authenticate } from '../_lib/auth.js';
import { chunkText } from '../_lib/chunking.js';
import { embedTexts } from '../_lib/embeddings.js';

async function requirePlatformAdmin(userId) {
  if (!supabaseAdmin) return false;
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  if (!(await requirePlatformAdmin(auth.userId))) {
    return res.status(403).json({ success: false, error: 'Platform admin required' });
  }

  const { dryRun = false, projectId = null } = req.body || {};

  try {
    // Find project_context rows that have no chunks yet.
    let query = supabaseAdmin
      .from('project_context')
      .select('id, project_id, raw_text, content, title');
    if (projectId) query = query.eq('project_id', projectId);
    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) throw new Error(rowsErr.message);

    // Filter to rows missing chunks
    const { data: alreadyChunked } = await supabaseAdmin
      .from('context_chunks')
      .select('project_context_id');
    const haveChunks = new Set((alreadyChunked || []).map(r => r.project_context_id));
    const todo = (rows || []).filter(r => !haveChunks.has(r.id));

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        rowsTotal: rows?.length || 0,
        rowsToEmbed: todo.length,
        titles: todo.map(r => r.title),
      });
    }

    const results = [];
    for (const row of todo) {
      const source = row.raw_text || row.content || '';
      const chunks = chunkText(source);
      if (chunks.length === 0) {
        results.push({ id: row.id, title: row.title, chunkCount: 0, skipped: 'empty' });
        continue;
      }
      try {
        const embeddings = await embedTexts(chunks);
        const insertRows = chunks.map((text, i) => ({
          project_context_id: row.id,
          project_id:         row.project_id,
          chunk_idx:          i,
          text,
          embedding:          embeddings[i],
        }));
        const { error: insErr } = await supabaseAdmin
          .from('context_chunks')
          .insert(insertRows);
        if (insErr) {
          results.push({ id: row.id, title: row.title, error: insErr.message });
          continue;
        }
        results.push({ id: row.id, title: row.title, chunkCount: chunks.length });
      } catch (err) {
        results.push({ id: row.id, title: row.title, error: err.message });
      }
    }

    return res.json({
      success: true,
      processed: results.length,
      details: results,
    });
  } catch (err) {
    console.error('[backfill-embeddings]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
