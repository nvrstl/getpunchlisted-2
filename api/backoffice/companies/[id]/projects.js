import { checkAuth } from '../../_auth.js';

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { id } = req.query;

  if (req.method === 'POST') {
    const { projectId, name, ownerEmail, city, status, projectNumber,
            startDate, plannedCompletion, contractValue, description } = req.body || {};

    // Two modes: link an existing unattached project (legacy), OR create a new
    // project from scratch (the canonical flow now that the regular UI no
    // longer has a "create project" path).
    let project;

    if (projectId) {
      // ── Link mode ────────────────────────────────────────────────────────
      const { data, error } = await supabaseAdmin.from('projects')
        .update({ company_id: id })
        .eq('id', projectId)
        .select('id, name, city, status').single();
      if (error) return res.status(500).json({ success: false, error: error.message });
      project = data;
    } else if (name?.trim()) {
      // ── Create mode ──────────────────────────────────────────────────────
      if (!ownerEmail?.trim()) {
        return res.status(400).json({ success: false, error: 'ownerEmail is verplicht' });
      }

      // Owner must exist as an auth user. Resolve to id so RLS works.
      const { data: ownerUser } = await supabaseAdmin
        .schema('auth').from('users').select('id')
        .eq('email', ownerEmail.trim().toLowerCase()).maybeSingle();
      if (!ownerUser) {
        return res.status(400).json({
          success: false,
          error: `No registered account with email ${ownerEmail}. They must sign up first.`,
        });
      }

      const { data, error } = await supabaseAdmin.from('projects').insert({
        name:               name.trim(),
        owner_id:           ownerUser.id,
        company_id:         id,                              // bound to this company
        status:             status || 'active',
        project_number:     projectNumber?.trim() || null,
        city:               city?.trim() || null,
        start_date:         startDate || null,
        planned_completion: plannedCompletion || null,
        contract_value:     contractValue ? parseFloat(contractValue) : null,
        description:        description?.trim() || null,
      }).select('id, name, city, status').single();
      if (error) return res.status(500).json({ success: false, error: error.message });
      project = data;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either projectId (to link) or name + ownerEmail (to create) is required',
      });
    }

    // Auto-add every company user as a project_member so the whole company
    // can collaborate on the new/linked project without manual invites.
    const { data: companyUsers } = await supabaseAdmin
      .from('company_users').select('email, user_id').eq('company_id', id);
    if (companyUsers?.length) {
      await supabaseAdmin.from('project_members').upsert(
        companyUsers.map(u => ({
          project_id: project.id,
          email: u.email,
          user_id: u.user_id || null,
          role: 'member',
        })),
        { onConflict: 'project_id,email', ignoreDuplicates: true }
      );
    }

    return res.json({ success: true, data: project });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
