import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const NAME_NEEDLE = 'violettestraat';
const EMAILS = ['hello@gauthiertijtgat.be', 'gauthier@homate.be'];

const { data: projects, error: projErr } = await supa
  .from('projects')
  .select('id, name, owner_id, project_number, status')
  .ilike('name', `%${NAME_NEEDLE}%`);

if (projErr) { console.error('Lookup failed:', projErr.message); process.exit(1); }
if (!projects?.length) { console.error(`No project found matching "${NAME_NEEDLE}".`); process.exit(2); }

console.log(`Found ${projects.length} project(s):`);
projects.forEach(p => console.log(`  • ${p.name} [${p.status}]  id=${p.id}`));

if (projects.length > 1) {
  console.error('\nMore than one match — aborting. Be more specific.');
  process.exit(3);
}

const project = projects[0];

const { data: existing } = await supa
  .from('project_members')
  .select('id, email, role')
  .eq('project_id', project.id);

const existingEmails = new Set((existing || []).map(m => (m.email || '').toLowerCase()));

console.log(`\nExisting members (${existing?.length || 0}):`);
(existing || []).forEach(m => console.log(`  • ${m.email}  [${m.role}]`));

const toInsert = EMAILS
  .map(e => e.trim().toLowerCase())
  .filter(e => !existingEmails.has(e))
  .map(email => ({ project_id: project.id, email, role: 'member' }));

if (!toInsert.length) {
  console.log('\nNothing to insert — both emails are already members.');
  process.exit(0);
}

console.log(`\nInserting ${toInsert.length} member(s):`);
toInsert.forEach(r => console.log(`  + ${r.email}`));

const { data: inserted, error: insErr } = await supa
  .from('project_members')
  .insert(toInsert)
  .select('id, email, role');

if (insErr) { console.error('\nInsert failed:', insErr.message); process.exit(4); }

console.log('\nInserted:');
(inserted || []).forEach(m => console.log(`  ✓ ${m.email}  [${m.role}]  id=${m.id}`));
