import { checkAuth } from '../../../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { projectId } = req.query;

  // Detach project from its company.
  const { data: project, error: updErr } = await supabaseAdmin
    .from('projects')
    .update({ company_id: null })
    .eq('id', projectId)
    .select('owner_id')
    .single();
  if (updErr) return res.status(500).json({ success: false, error: updErr.message });

  // Strip every project_members row except the owner's — otherwise users
  // from the formerly-linked company still see the project (the link adds
  // them as members, so detaching has to symmetrically remove them).
  // OR is needed because .neq skips NULL rows (email-only invites where
  // user_id hasn't been backfilled yet).
  const { error: pmErr } = await supabaseAdmin
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .or(`user_id.is.null,user_id.neq.${project.owner_id}`);
  if (pmErr) console.warn('[detach] failed to strip members:', pmErr.message);

  res.json({ success: true });
}
