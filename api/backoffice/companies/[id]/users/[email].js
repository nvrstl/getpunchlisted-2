import { checkAuth } from '../../../_auth.js';

const VALID_ROLES = ['owner', 'admin', 'member'];

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { id, email } = req.query;
  const decodedEmail = decodeURIComponent(email);

  if (req.method === 'PATCH') {
    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Ongeldige rol.' });
    }
    if (role === 'admin') {
      const { count } = await supabaseAdmin.from('company_users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id).eq('role', 'admin').neq('email', decodedEmail);
      if (count > 0) return res.status(400).json({ success: false, error: 'Dit bedrijf heeft al een beheerder.' });
    }
    const { data, error } = await supabaseAdmin.from('company_users')
      .update({ role }).eq('company_id', id).eq('email', decodedEmail).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.from('company_users')
      .delete().eq('company_id', id).eq('email', decodedEmail);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
