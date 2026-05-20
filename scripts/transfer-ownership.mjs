import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE env vars.'); process.exit(1); }

const supa = createClient(url, key, { auth: { persistSession: false } });

const TARGET_EMAIL = 'hello@gauthiertijtgat.be';

// Find target user id by paginating auth users (no direct getUserByEmail).
let targetId = null;
for (let page = 1; page <= 20; page++) {
  const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error('listUsers failed:', error.message); process.exit(2); }
  const match = (data?.users || []).find(u => (u.email || '').toLowerCase() === TARGET_EMAIL);
  if (match) { targetId = match.id; break; }
  if (!data?.users?.length || data.users.length < 200) break;
}

if (!targetId) {
  console.error(`No auth user found with email "${TARGET_EMAIL}".`);
  console.error('They need to sign up / sign in at least once before becoming an owner.');
  process.exit(3);
}
console.log(`Target user: ${TARGET_EMAIL}  id=${targetId}\n`);

// Fetch all projects + current owners
const { data: projects, error: projErr } = await supa
  .from('projects')
  .select('id, name, status, owner_id');
if (projErr) { console.error('Project lookup failed:', projErr.message); process.exit(4); }

if (!projects?.length) { console.log('No projects in DB.'); process.exit(0); }

// Resolve current owner emails for display
const ownerIds = [...new Set(projects.map(p => p.owner_id).filter(Boolean))];
const emailById = {};
for (const id of ownerIds) {
  const { data } = await supa.auth.admin.getUserById(id);
  emailById[id] = data?.user?.email || '(unknown)';
}

const toChange = projects.filter(p => p.owner_id !== targetId);
console.log(`Total projects: ${projects.length}`);
console.log(`Already owned by ${TARGET_EMAIL}: ${projects.length - toChange.length}`);
console.log(`Will be transferred: ${toChange.length}\n`);

if (!toChange.length) { console.log('Nothing to do.'); process.exit(0); }

console.log('Projects to transfer:');
toChange.forEach(p => console.log(`  • ${p.name} [${p.status}]  was: ${emailById[p.owner_id] ?? '—'}`));

const { data: updated, error: updErr } = await supa
  .from('projects')
  .update({ owner_id: targetId })
  .in('id', toChange.map(p => p.id))
  .select('id, name');
if (updErr) { console.error('\nUpdate failed:', updErr.message); process.exit(5); }

console.log(`\n✓ Updated ${updated?.length || 0} project(s).`);
