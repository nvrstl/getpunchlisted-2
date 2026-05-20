import { checkAuth } from '../../_auth.js';

const VALID_ROLES = ['owner', 'admin', 'member'];

export default async function handler(req, res) {
  const supabaseAdmin = await checkAuth(req, res);
  if (!supabaseAdmin) return;

  const { id } = req.query;

  if (req.method === 'POST') {
    const { email, role = 'member' } = req.body;
    if (!email?.trim()) return res.status(400).json({ success: false, error: 'E-mail is verplicht' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Ongeldige rol.' });

    if (role === 'admin') {
      const { count } = await supabaseAdmin.from('company_users').select('id', { count: 'exact', head: true }).eq('company_id', id).eq('role', 'admin');
      if (count > 0) return res.status(400).json({ success: false, error: 'Dit bedrijf heeft al een beheerder. Verwijder de huidige beheerder voor je een nieuwe toevoegt.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = (users || []).find(u => u.email?.toLowerCase() === normalizedEmail);

    let resolvedUserId = existingUser?.id || null;

    // New user: invite via Supabase — creates auth account + sends invite email
    let inviteError = null;
    if (!existingUser) {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail);
      if (inviteData?.user?.id) resolvedUserId = inviteData.user.id;
      else if (inviteErr) inviteError = inviteErr.message;
    }

    const { data, error } = await supabaseAdmin.from('company_users').insert({
      company_id: id,
      user_id: resolvedUserId,
      email: normalizedEmail,
      role,
      accepted_at: existingUser ? new Date().toISOString() : null,
    }).select().single();

    if (error) {
      const msg = error.code === '23505' ? 'Gebruiker al gekoppeld aan dit bedrijf.' : error.message;
      return res.status(400).json({ success: false, error: msg });
    }

    // Auto-add the new user to all projects already linked to this company
    const { data: linkedProjects } = await supabaseAdmin
      .from('projects').select('id').eq('company_id', id);
    if (linkedProjects?.length) {
      await supabaseAdmin.from('project_members').upsert(
        linkedProjects.map(p => ({ project_id: p.id, email: normalizedEmail, user_id: resolvedUserId, role: 'member' })),
        { onConflict: 'project_id,email', ignoreDuplicates: true }
      );
    }

    return res.json({ success: true, data, ...(inviteError && { inviteError }) });
  }

  res.status(405).json({ success: false, error: 'Method not allowed' });
}
