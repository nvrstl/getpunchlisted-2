import { checkAuth } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { data, error } = await supabaseAdmin.from('projects')
    .select('id, name, city, status').is('company_id', null).order('name');
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: data || [] });
}
