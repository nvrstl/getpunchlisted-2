/**
 * Backfill project_members.user_id by matching email → auth.users.
 *
 * RLS policies on project_contacts / outbound_emails / field_logs etc. all check
 *   project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
 * so any row where user_id is NULL silently hides the project from that team-mate.
 *
 * Run:  node scripts/backfill-member-user-ids.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// 1. Load every auth user (email → id map)
const emailToId = new Map();
for (let page = 1; page <= 50; page++) {
  const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error); process.exit(1); }
  for (const u of (data?.users || [])) {
    if (u.email) emailToId.set(u.email.toLowerCase(), u.id);
  }
  if (!data?.users?.length || data.users.length < 200) break;
}
console.log(`auth users known: ${emailToId.size}`);

// 2. Find project_members rows missing user_id
const { data: pending, error: pErr } = await supa
  .from('project_members')
  .select('id, project_id, email')
  .is('user_id', null);
if (pErr) { console.error(pErr); process.exit(2); }

console.log(`project_members rows missing user_id: ${pending?.length || 0}`);

let linked = 0, stillPending = 0;
for (const m of (pending || [])) {
  const id = emailToId.get((m.email || '').toLowerCase());
  if (!id) { stillPending++; continue; }
  const { error } = await supa.from('project_members').update({ user_id: id }).eq('id', m.id);
  if (error) console.warn(`  ! ${m.email}: ${error.message}`);
  else { linked++; console.log(`  ✓ ${m.email} → ${id}`); }
}
console.log(`\nLinked: ${linked}.  Still pending (user has not signed up yet): ${stillPending}.`);
