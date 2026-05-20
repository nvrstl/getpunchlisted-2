import { checkAuth } from './backoffice/_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  if (req.method === 'GET') return handleList(supabaseAdmin, req, res);
  if (req.method === 'POST') return handleCreate(supabaseAdmin, req, res);
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleList(supabaseAdmin, req, res) {
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const userEmailMap = {};
    (users || []).forEach(u => { userEmailMap[u.id] = u.email; });

    const { data: projects, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, status, owner_id, created_at, project_number, city, client_name, project_manager')
      .order('created_at', { ascending: false });
    if (projErr) throw new Error(projErr.message);

    const { data: members } = await supabaseAdmin.from('project_members').select('id, project_id, email, role');
    const membersByProject = {};
    (members || []).forEach(m => {
      if (!membersByProject[m.project_id]) membersByProject[m.project_id] = [];
      membersByProject[m.project_id].push({ id: m.id, email: m.email, role: m.role });
    });

    const formatted = (projects || []).map(p => ({
      id: p.id, name: p.name, status: p.status,
      ownerEmail: userEmailMap[p.owner_id] || null,
      ownerId: p.owner_id,
      projectNumber: p.project_number, city: p.city,
      clientName: p.client_name, projectManager: p.project_manager,
      createdAt: p.created_at,
      members: membersByProject[p.id] || [],
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function handleCreate(supabaseAdmin, req, res) {
  const { name, ownerEmail, status, projectNumber, city, clientName, projectManager, startDate, plannedCompletion, contractValue, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  if (!ownerEmail?.trim()) return res.status(400).json({ success: false, error: 'Owner email is required' });
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const owner = (users || []).find(u => u.email?.toLowerCase() === ownerEmail.trim().toLowerCase());
    if (!owner) return res.status(400).json({ success: false, error: `No registered user found with email: ${ownerEmail}` });

    const { data, error } = await supabaseAdmin.from('projects').insert({
      name: name.trim(), owner_id: owner.id,
      status: status || 'active',
      project_number: projectNumber?.trim() || null,
      city: city?.trim() || null,
      client_name: clientName?.trim() || null,
      project_manager: projectManager?.trim() || null,
      start_date: startDate || null,
      planned_completion: plannedCompletion || null,
      contract_value: contractValue ? parseFloat(contractValue) : null,
      description: description?.trim() || null,
    }).select().single();
    if (error) throw new Error(error.message);
    res.json({ success: true, data: { ...data, ownerEmail: owner.email, members: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
