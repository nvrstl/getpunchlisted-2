// Shared helpers for Vercel serverless handlers.
// Mirrors the requireUser middleware that lives in server.js, but factored
// out so multiple /api functions can reuse it without each one re-creating
// a Supabase admin client and re-implementing the JWT verify step.

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Resolves the caller from the Bearer JWT. Returns { userId, userEmail } on
// success, or sends a 401/503 response and returns null on failure.
export async function authenticate(req, res) {
  if (!supabaseAdmin) {
    res.status(503).json({ success: false, error: 'Server not configured (missing Supabase env vars)' });
    return null;
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Missing token' });
    return null;
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }
  return { userId: user.id, userEmail: user.email || null };
}
