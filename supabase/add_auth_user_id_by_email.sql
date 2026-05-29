-- ── Fast auth.users lookup by email ──────────────────────────────────────────
-- Supabase JS doesn't expose a getUserByEmail admin method, so the only
-- ways to find a user by email are (a) listUsers pagination (slow + capped
-- at 1000) or (b) a service-role SQL query against auth.users.
--
-- This security-definer function gives us option (b) via a single RPC call,
-- safe to call from any server-side endpoint that has service-role access.
-- Returns NULL if no user with that email exists.

create or replace function auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

revoke all on function auth_user_id_by_email(text) from public;
grant execute on function auth_user_id_by_email(text) to authenticated, service_role;
