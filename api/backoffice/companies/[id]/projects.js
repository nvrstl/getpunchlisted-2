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
      const cleanEmail = ownerEmail.trim().toLowerCase();

      // Owner must be a user of this company. company_users already has the
      // resolved auth user_id (set by the invite-user flow), so look up there
      // instead of querying auth.users (which needs special PostgREST grants).
      const { data: companyUser } = await supabaseAdmin
        .from('company_users')
        .select('user_id, email')
        .eq('company_id', id)
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!companyUser) {
        return res.status(400).json({
          success: false,
          error: `${ownerEmail} is geen gebruiker van dit bedrijf. Voeg hem/haar eerst toe.`,
        });
      }
      if (!companyUser.user_id) {
        return res.status(400).json({
          success: false,
          error: `${ownerEmail} heeft de uitnodiging nog niet aanvaard. Vraag hen om hun e-mail te checken en een wachtwoord in te stellen voor je een project op hun naam zet.`,
        });
      }

      const { data, error } = await supabaseAdmin.from('projects').insert({
        name:               name.trim(),
        owner_id:           companyUser.user_id,
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
