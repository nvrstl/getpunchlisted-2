// GET /api/projects/:projectId/members  → list members (owner or member)
// POST /api/projects/:projectId/members → add member (owner only)

import { supabaseAdmin, authenticate } from '../../_lib/auth.js';

export default async function handler(req, res) {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { userId } = auth;

  // Vercel passes dynamic segments via req.query (also via the rewrite in vercel.json).
  const projectId = req.query.projectId;
  if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

  // Verify the project exists + check authorization for the requested operation.
  const { data: proj } = await supabaseAdmin
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

  if (req.method === 'GET') {
    // Project owner or any member can read the list
    const { data: membership } = await supabaseAdmin
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (proj.owner_id !== userId && !membership) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { data, error } = await supabaseAdmin
      .from('project_members')
      .select('id, email, role, whatsapp_phone')
      .eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'POST') {
    // Owner OR any existing member of the project can add new members.
    const { data: membership } = await supabaseAdmin
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (proj.owner_id !== userId && !membership) {
      return res.status(403).json({ success: false, error: 'You must be a project member to add others' });
    }
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const cleanEmail = String(email).trim().toLowerCase();

    // Resolve user_id by email if the account already exists, so RLS sees the
    // membership immediately. Uses a direct auth.users query (much faster than
    // listUsers pagination — that approach was timing out on Vercel).
    let resolvedUserId = null;
    try {
      const { data: u } = await supabaseAdmin
        .schema('auth')
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();
      resolvedUserId = u?.id || null;
    } catch (e) {
      console.warn('[members] user lookup failed:', e.message);
    }

    const { data, error } = await supabaseAdmin
      .from('project_members')
      .insert({ project_id: projectId, email: cleanEmail, role: 'member', user_id: resolvedUserId })
      .select('id, email, role, whatsapp_phone')
      .single();
    if (error) {
      const msg = error.code === '23505' ? 'Already a member.' : error.message;
      return res.status(400).json({ success: false, error: msg });
    }
    return res.json({ success: true, data });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
