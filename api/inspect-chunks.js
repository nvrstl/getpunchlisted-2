// GET  /api/inspect-chunks?projectId=...                 → docs + chunk counts + previews
// POST /api/inspect-chunks  { chunkId }                  → top-K semantically similar chunks
//
// Read-only view into the embedded chunk store for a project. Used by the
// 'Fragmenten' tab in the Context drawer so users can see exactly what
// landed in the vector store and how chunks across documents relate.

import { supabaseAdmin, authenticate } from './_lib/auth.js';

const PREVIEW_CHARS = 220;
const NEIGHBOUR_K   = 6;

async function callerCanAccessProject(userId, projectId) {
  if (!userId || !projectId) return false;
  const { data: proj } = await supabaseAdmin
    .from('projects').select('owner_id, company_id').eq('id', projectId).maybeSingle();
  if (!proj) return false;
  if (proj.owner_id === userId) return true;
  const { data: memb } = await supabaseAdmin
    .from('project_members').select('id').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
  if (memb) return true;
  if (proj.company_id) {
    const { data: cu } = await supabaseAdmin
      .from('company_users').select('id').eq('user_id', userId).eq('company_id', proj.company_id).maybeSingle();
    if (cu) return true;
  }
  return false;
}

export default async function handler(req, res) {
  const auth = await authenticate(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    const projectId = req.query.projectId;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    if (!(await callerCanAccessProject(auth.userId, projectId))) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Fetch all documents for the project (titles, sizes, categories).
    const { data: docs, error: docsErr } = await supabaseAdmin
      .from('project_context')
      .select('id, title, category, source, content, raw_text, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (docsErr) return res.status(500).json({ success: false, error: docsErr.message });

    // Chunk counts per document — single grouped query so the page loads fast.
    const { data: chunkRows, error: ccErr } = await supabaseAdmin
      .from('context_chunks')
      .select('project_context_id, id, chunk_idx, text')
      .eq('project_id', projectId)
      .order('chunk_idx', { ascending: true });
    if (ccErr) {
      // Likely cause: pgvector migration not applied. Treat as zero chunks
      // rather than 500ing — still useful to see documents.
      console.warn('[inspect-chunks] context_chunks fetch:', ccErr.message);
    }

    const chunksByDoc = new Map();
    for (const ch of chunkRows || []) {
      if (!chunksByDoc.has(ch.project_context_id)) chunksByDoc.set(ch.project_context_id, []);
      chunksByDoc.get(ch.project_context_id).push({
        id:      ch.id,
        idx:     ch.chunk_idx,
        preview: (ch.text || '').slice(0, PREVIEW_CHARS).replace(/\s+/g, ' ').trim(),
      });
    }

    const result = (docs || []).map(d => ({
      id:          d.id,
      title:       d.title,
      category:    d.category,
      source:      d.source,
      rawChars:    d.raw_text ? d.raw_text.length : 0,
      summaryChars: d.content ? d.content.length : 0,
      chunkCount:  (chunksByDoc.get(d.id) || []).length,
      chunks:      chunksByDoc.get(d.id) || [],
      createdAt:   d.created_at,
    }));

    return res.json({ success: true, docs: result });
  }

  if (req.method === 'POST') {
    // Find chunks semantically similar to the supplied chunk (any project).
    const { chunkId } = req.body || {};
    if (!chunkId) return res.status(400).json({ success: false, error: 'chunkId required' });

    const { data: source, error: srcErr } = await supabaseAdmin
      .from('context_chunks')
      .select('id, project_id, project_context_id, text, embedding')
      .eq('id', chunkId)
      .maybeSingle();
    if (srcErr || !source) return res.status(404).json({ success: false, error: 'chunk not found' });
    if (!source.embedding) return res.json({ success: true, neighbours: [] });
    if (!(await callerCanAccessProject(auth.userId, source.project_id))) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { data: matches, error: matchErr } = await supabaseAdmin.rpc('match_context_chunks', {
      p_project_id:  source.project_id,
      p_embedding:   source.embedding,
      p_match_count: NEIGHBOUR_K + 1, // +1 because the source chunk itself is the top match
    });
    if (matchErr) return res.status(500).json({ success: false, error: matchErr.message });

    // Attach parent doc titles so the UI can label each neighbour.
    const neighbours = (matches || []).filter(m => m.chunk_id !== chunkId);
    const parentIds = [...new Set(neighbours.map(n => n.project_context_id))];
    const { data: parents } = await supabaseAdmin
      .from('project_context').select('id, title').in('id', parentIds);
    const titleById = new Map((parents || []).map(p => [p.id, p.title]));

    return res.json({
      success: true,
      neighbours: neighbours.map(n => ({
        chunkId:      n.chunk_id,
        contextId:    n.project_context_id,
        contextTitle: titleById.get(n.project_context_id) || 'onbekend',
        similarity:   n.similarity,
        preview:      (n.text || '').slice(0, PREVIEW_CHARS).replace(/\s+/g, ' ').trim(),
      })),
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
