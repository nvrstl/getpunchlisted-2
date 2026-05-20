import { checkAuth } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [companiesRes, projectsRes, usersRes, aiRes] = await Promise.all([
      supabaseAdmin.from('companies').select('id, status', { count: 'exact' }),
      supabaseAdmin.from('projects').select('id', { count: 'exact' }),
      supabaseAdmin.from('project_members').select('email').then(async (r) => {
        const memberEmails = new Set((r.data || []).map(m => m.email));
        const ownersRes = await supabaseAdmin.from('projects').select('owner_id');
        return { count: memberEmails.size + (ownersRes.data || []).length };
      }),
      supabaseAdmin.from('ai_usage_logs').select('id', { count: 'exact' }).gte('created_at', monthStart),
    ]);

    const activeCompanies = (companiesRes.data || []).filter(c => c.status === 'active').length;
    const runningProjects = projectsRes.count || 0;

    res.json({
      success: true,
      data: {
        activeCompanies,
        runningProjects,
        totalUsers: usersRes.count || 0,
        aiRequestsThisMonth: aiRes.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
