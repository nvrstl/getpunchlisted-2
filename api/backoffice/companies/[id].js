import { checkAuth } from '../_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const [companyRes, usersRes, projectsRes] = await Promise.all([
        supabaseAdmin.from('companies').select('*').eq('id', id).single(),
        supabaseAdmin.from('company_users').select('*').eq('company_id', id).order('invited_at', { ascending: false }),
        supabaseAdmin.from('projects').select('id, name, city, status, created_at').eq('company_id', id).order('created_at', { ascending: false }),
      ]);
      if (companyRes.error) return res.status(404).json({ success: false, error: 'Bedrijf niet gevonden' });

      const projectsWithLogs = await Promise.all((projectsRes.data || []).map(async (p) => {
        const { count } = await supabaseAdmin.from('field_logs').select('id', { count: 'exact' }).eq('project_id', p.id);
        return { ...p, logCount: count || 0 };
      }));

      res.json({ success: true, data: { company: companyRes.data, users: usersRes.data || [], projects: projectsWithLogs } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const fields = ['name', 'vat_number', 'email', 'phone', 'address_street', 'address_zip', 'address_city', 'notes', 'status'];
    const updates = { updated_at: new Date().toISOString() };
    fields.forEach(f => { if (f in req.body) updates[f] = req.body[f]; });
    const { data, error } = await supabaseAdmin.from('companies').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    await supabaseAdmin.from('company_users').delete().eq('company_id', id);
    const { error } = await supabaseAdmin.from('companies').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
