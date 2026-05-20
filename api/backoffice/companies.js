import { checkAuth } from './_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  if (req.method === 'GET') {
    try {
      const { search = '', status = 'all', page = '1', limit = '10' } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset = (pageNum - 1) * limitNum;

      let query = supabaseAdmin.from('companies').select('*', { count: 'exact' });
      if (status !== 'all') query = query.eq('status', status);
      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,vat_number.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }
      query = query.order('created_at', { ascending: false }).range(offset, offset + limitNum - 1);

      const { data: companies, count, error } = await query;
      if (error) return res.status(500).json({ success: false, error: error.message });

      const enriched = await Promise.all((companies || []).map(async (c) => {
        const [usersRes, projectsRes] = await Promise.all([
          supabaseAdmin.from('company_users').select('id', { count: 'exact' }).eq('company_id', c.id),
          supabaseAdmin.from('projects').select('id', { count: 'exact' }).eq('company_id', c.id),
        ]);
        return { ...c, userCount: usersRes.count || 0, activeProjects: projectsRes.count || 0 };
      }));

      res.json({ success: true, data: enriched, total: count || 0, page: pageNum, limit: limitNum });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const { name, vat_number, email, phone, address_street, address_zip, address_city, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Bedrijfsnaam is verplicht' });
    if (!email?.trim()) return res.status(400).json({ success: false, error: 'E-mail is verplicht' });
    const { data, error } = await supabaseAdmin.from('companies').insert({
      name: name.trim(), vat_number: vat_number?.trim() || null, email: email.trim().toLowerCase(),
      phone: phone?.trim() || null, address_street: address_street?.trim() || null,
      address_zip: address_zip?.trim() || null, address_city: address_city?.trim() || null,
      notes: notes?.trim() || null, status: 'active',
    }).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
