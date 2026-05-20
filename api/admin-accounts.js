import { checkAuth } from './backoffice/_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  try {
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    if (usersErr) throw new Error(usersErr.message);

    const { data: projects, error: projErr } = await supabaseAdmin
      .from('projects').select('id, name, status, owner_id, created_at');
    if (projErr) throw new Error(projErr.message);

    const { data: logs, error: logsErr } = await supabaseAdmin
      .from('field_logs').select('project_id');
    if (logsErr) throw new Error(logsErr.message);

    const logsPerProject = {};
    (logs || []).forEach(l => { logsPerProject[l.project_id] = (logsPerProject[l.project_id] || 0) + 1; });

    const projectsPerUser = {};
    (projects || []).forEach(p => { projectsPerUser[p.owner_id] = (projectsPerUser[p.owner_id] || 0) + 1; });

    const userEmailMap = {};
    (users || []).forEach(u => { userEmailMap[u.id] = u.email; });

    const formattedUsers = (users || []).map(u => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      projectCount: projectsPerUser[u.id] || 0,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const formattedProjects = (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      ownerEmail: userEmailMap[p.owner_id] || p.owner_id,
      logCount: logsPerProject[p.id] || 0,
      createdAt: p.created_at,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: { users: formattedUsers, projects: formattedProjects } });
  } catch (err) {
    console.error('admin/accounts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
