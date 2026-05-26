// POST /api/auth/sync-memberships
// Link any project_members rows that were created by email-only invite
// (user_id IS NULL) to the authenticated user's id, so RLS can see the
// membership. Called once per session from the AuthContext.

import { supabaseAdmin, authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { userId, userEmail } = auth;

  if (!userEmail) return res.json({ success: true, linked: 0 });

  const { data, error } = await supabaseAdmin
    .from('project_members')
    .update({ user_id: userId })
    .is('user_id', null)
    .eq('email', userEmail.toLowerCase())
    .select('id');
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, linked: data?.length || 0 });
}
