// Run once: node scripts/setup-platform-admin.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL    = 'admin@punchlister.ai';
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || process.argv[2];

if (!PASSWORD) {
  console.error('Usage: node scripts/setup-platform-admin.js <password>');
  process.exit(1);
}

// Check if user already exists
const { data: { users } } = await supabase.auth.admin.listUsers();
let existing = users.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase());

if (existing) {
  console.log(`User already exists (${existing.id}), updating password…`);
  const { error } = await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD });
  if (error) { console.error('Failed to update password:', error.message); process.exit(1); }
} else {
  console.log('Creating user…');
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) { console.error('Failed to create user:', error.message); process.exit(1); }
  existing = data.user;
  console.log(`User created: ${existing.id}`);
}

// Register as platform admin
const { error: adminError } = await supabase
  .from('platform_admins')
  .upsert({ user_id: existing.id }, { onConflict: 'user_id' });

if (adminError) {
  console.error('Failed to register platform admin:', adminError.message);
  process.exit(1);
}

console.log(`\n✓ Platform admin set up successfully`);
console.log(`  Email:   ${EMAIL}`);
console.log(`  User ID: ${existing.id}`);
console.log('\nYou can now log in at the backoffice.');
