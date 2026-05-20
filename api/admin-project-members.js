import { checkAuth } from './backoffice/_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { projectId, memberId } = req.query;
  if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

  if (req.method === 'POST') {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const { data, error } = await supabaseAdmin.from('project_members')
      .insert({ project_id: projectId, email: email.trim().toLowerCase(), role: role || 'member' })
      .select('id, email, role').single();
    if (error) {
      const msg = error.code === '23505' ? 'Already a member.' : error.message;
      return res.status(400).json({ success: false, error: msg });
    }
    return res.json({ success: true, data });
  }

  if (!memberId) return res.status(400).json({ success: false, error: 'memberId required for PATCH/DELETE' });

  if (req.method === 'PATCH') {
    const { role } = req.body;
    if (!role) return res.status(400).json({ success: false, error: 'Role required' });
    const { data, error } = await supabaseAdmin.from('project_members')
      .update({ role })
      .eq('id', memberId).eq('project_id', projectId)
      .select('id, email, role').single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.from('project_members')
      .delete().eq('id', memberId).eq('project_id', projectId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
