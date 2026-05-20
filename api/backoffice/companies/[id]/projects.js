import { checkAuth } from '../../_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { id } = req.query;

  if (req.method === 'POST') {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is verplicht' });

    const { data, error } = await supabaseAdmin.from('projects')
      .update({ company_id: id }).eq('id', projectId).select('id, name, city, status').single();
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Auto-add all company users to the newly linked project
    const { data: companyUsers } = await supabaseAdmin
      .from('company_users').select('email, user_id').eq('company_id', id);
    if (companyUsers?.length) {
      await supabaseAdmin.from('project_members').upsert(
        companyUsers.map(u => ({ project_id: projectId, email: u.email, user_id: u.user_id || null, role: 'member' })),
        { onConflict: 'project_id,email', ignoreDuplicates: true }
      );
    }

    return res.json({ success: true, data });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
