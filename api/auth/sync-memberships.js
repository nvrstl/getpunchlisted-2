// POST /api/auth/sync-memberships
// Called once per session from AuthContext on SIGNED_IN. Two backfills:
//   1. project_members: link rows created by email-only invite (user_id NULL)
//      to the authed user, so RLS sees them.
//   2. company_users: same link + stamp accepted_at if not yet set, so the
//      backoffice can show "Geaccepteerd" instead of "Uitnodiging verstuurd"
//      after the invitee actually logs in for the first time.

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
  const email = userEmail.toLowerCase();

  // 1) project_members: link email-only invites
  const { data: pmRows, error: pmErr } = await supabaseAdmin
    .from('project_members')
    .update({ user_id: userId })
    .is('user_id', null)
    .eq('email', email)
    .select('id');
  if (pmErr) return res.status(500).json({ success: false, error: pmErr.message });

  // 2) company_users: link + accept any matching row that hasn't been
  //    accepted yet. Matches by email so it covers both the
  //    "user_id was NULL" case and the "user_id set at invite time but
  //    accepted_at never stamped" case.
  const { data: cuRows, error: cuErr } = await supabaseAdmin
    .from('company_users')
    .update({ user_id: userId, accepted_at: new Date().toISOString() })
    .eq('email', email)
    .is('accepted_at', null)
    .select('id');
  if (cuErr) console.warn('[sync-memberships] company_users backfill:', cuErr.message);

  return res.json({
    success: true,
    project_links: pmRows?.length || 0,
    company_accepts: cuRows?.length || 0,
  });
}
