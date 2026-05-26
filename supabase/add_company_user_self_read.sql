-- ── Let a user read their own company membership ─────────────────────────────
-- company_users was originally locked to service-role only. Project creation
-- needs the frontend to know which company the creator belongs to so it can
-- stamp company_id on the new project row. Reading your own membership row
-- isn't sensitive; reading other users' memberships still requires the
-- backend / service-role key.

drop policy if exists "users can read own company membership" on company_users;
create policy "users can read own company membership"
  on company_users
  for select
  using (user_id = auth.uid());
