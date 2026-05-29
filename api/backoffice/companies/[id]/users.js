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

    // Fast lookup via SQL — listUsers pagination caps at 1000 and would
    // silently miss anyone past that. The RPC hits auth.users directly
    // with service-role privileges and returns NULL if no match.
    const { data: existingId } = await supabaseAdmin.rpc('auth_user_id_by_email', {
      p_email: normalizedEmail,
    });

    let resolvedUserId = existingId || null;
    let inviteError = null;
    if (!resolvedUserId) {
      // New user: invite via Supabase — creates auth account + sends invite email
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail);
      if (inviteData?.user?.id) resolvedUserId = inviteData.user.id;
      else if (inviteErr) inviteError = inviteErr.message;
    }

    if (!resolvedUserId) {
      // Hard fail rather than silently insert a NULL user_id row that RLS
      // will then refuse to see. The caller surfaces this in the UI so the
      // admin knows to retry / check Supabase auth state.
      return res.status(500).json({
        success: false,
        error: `Kon geen auth-account vinden of aanmaken voor ${normalizedEmail}. ${inviteError ? `(${inviteError})` : ''}`,
      });
    }

    // accepted_at stamped now if the user already had an auth account before
    // we got here (no email confirmation needed); left NULL for fresh invites
    // so the backoffice badge can show 'Uitnodiging verstuurd' until they
    // sign in and sync-memberships flips it.
    const { data, error } = await supabaseAdmin.from('company_users').insert({
      company_id: id,
      user_id: resolvedUserId,
      email: normalizedEmail,
      role,
      accepted_at: existingId ? new Date().toISOString() : null,
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
