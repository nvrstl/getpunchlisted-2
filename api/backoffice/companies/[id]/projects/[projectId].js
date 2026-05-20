import { checkAuth } from '../../../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { projectId } = req.query;
  const { error } = await supabaseAdmin.from('projects').update({ company_id: null }).eq('id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
}
