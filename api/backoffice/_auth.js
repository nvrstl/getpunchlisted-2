import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function checkAuth(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) { res.status(503).json({ success: false, error: 'Admin not configured' }); return null; }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) { res.status(401).json({ success: false, error: 'Unauthorized' }); return null; }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return null; }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!admin) { res.status(403).json({ success: false, error: 'Forbidden' }); return null; }
  return supabase;
}
