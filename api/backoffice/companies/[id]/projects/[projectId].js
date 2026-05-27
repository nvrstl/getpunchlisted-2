import { checkAuth } from '../../../_auth.js';

// Hard-deletes a project owned by this company. All child rows (field_logs,
// rfis, punch_items, project_members, etc.) cascade via FK on delete cascade
// declared in the schema. There is no longer a "detach" semantic — the
// backoffice is the only path that manages projects, and detached projects
// are just dead weight.
export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { projectId } = req.query;
  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', projectId);
  if (error) return res.status(500).json({ success: false, error: error.message });

  res.json({ success: true });
}
