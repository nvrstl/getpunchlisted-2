// PATCH  /api/projects/:projectId/members/:memberId → update whatsapp_phone
// DELETE /api/projects/:projectId/members/:memberId → remove member
// Both restricted to the project owner.

import { supabaseAdmin, authenticate } from '../../../_lib/auth.js';

export default async function handler(req, res) {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { userId } = auth;

  const projectId = req.query.projectId;
  const memberId  = req.query.memberId;
  if (!projectId || !memberId) {
    return res.status(400).json({ success: false, error: 'projectId and memberId required' });
  }

  const { data: proj } = await supabaseAdmin
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
  if (proj.owner_id !== userId) {
    return res.status(403).json({ success: false, error: 'Only the project owner can edit members' });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('project_members')
      .delete()
      .eq('id', memberId)
      .eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'PATCH') {
    const { whatsapp_phone } = req.body || {};
    const { error } = await supabaseAdmin
      .from('project_members')
      .update({ whatsapp_phone: whatsapp_phone?.trim() || null })
      .eq('id', memberId)
      .eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
