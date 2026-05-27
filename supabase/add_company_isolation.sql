-- ── Company-based tenant isolation ────────────────────────────────────────────
-- A user may see / interact with a project ONLY when one of the following is
-- true:
--   1. They are the project owner.
--   2. They have an accepted project_members row for that project.
--   3. They belong to the same company as the project (via company_users).
--
-- This file:
--   • introduces a single security-definer helper user_can_access_project()
--     so every per-project policy stays consistent;
--   • rewrites the RLS policies on projects + all per-project child tables;
--   • adds a BEFORE INSERT trigger on projects that auto-stamps company_id
--     from the creator's company_users row, and rejects inserts when the
--     creator has no company. Keeps platform_admins able to create
--     unattached projects via the backoffice (the service role bypasses RLS
--     and triggers fired by SECURITY DEFINER functions can opt out).
--
-- Safe to re-run: every CREATE is preceded by DROP IF EXISTS.

-- ── Access helper ─────────────────────────────────────────────────────────────

create or replace function user_can_access_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and (
        pr.owner_id = auth.uid()
        or exists (
          select 1 from project_members pm
          where pm.project_id = p and pm.user_id = auth.uid()
        )
        or (
          pr.company_id is not null
          and pr.company_id in (
            select company_id from company_users cu where cu.user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function user_can_access_project(uuid) from public;
grant execute on function user_can_access_project(uuid) to authenticated;

-- ── projects: rewrite select policy ──────────────────────────────────────────
-- IMPORTANT: must use user_can_access_project() (SECURITY DEFINER) instead of
-- inline subqueries. The existing project_members policy subqueries projects,
-- so an inline subquery here creates a cycle that Postgres rejects with a
-- 500 at query time. SECURITY DEFINER bypasses RLS inside the function, so
-- the cycle is broken.

drop policy if exists "project_select" on projects;
create policy "project_select" on projects
  for select
  using (user_can_access_project(id));

-- ── Auto-stamp company_id on insert + require it ─────────────────────────────

create or replace function stamp_project_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  -- If a company_id was supplied by the caller, trust it (admin / service role).
  if new.company_id is not null then
    return new;
  end if;
  -- Resolve the creator's company from company_users.
  select company_id into v_company
  from company_users
  where user_id = new.owner_id
  limit 1;

  if v_company is null then
    raise exception 'Cannot create a project: owner is not assigned to a company. Ask a platform admin to add you to a company first.';
  end if;

  new.company_id := v_company;
  return new;
end;
$$;

drop trigger if exists projects_stamp_company on projects;
create trigger projects_stamp_company
  before insert on projects
  for each row execute function stamp_project_company();

-- ── Rewrite per-project child table policies to use the helper ───────────────

drop policy if exists "field_logs_all"     on field_logs;
create policy "field_logs_all" on field_logs
  for all using (user_can_access_project(project_id));

drop policy if exists "rfis_all"           on rfis;
create policy "rfis_all" on rfis
  for all using (user_can_access_project(project_id));

drop policy if exists "punch_items_all"    on punch_items;
create policy "punch_items_all" on punch_items
  for all using (user_can_access_project(project_id));

drop policy if exists "subcontractors_all" on subcontractors;
create policy "subcontractors_all" on subcontractors
  for all using (user_can_access_project(project_id));

-- Optional tables — only create the policy if the table exists in this DB
do $$
begin
  if to_regclass('public.variations')      is not null then
    execute 'drop policy if exists "variations_all" on variations';
    execute 'create policy "variations_all" on variations
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.disputes')        is not null then
    execute 'drop policy if exists "disputes_all" on disputes';
    execute 'create policy "disputes_all" on disputes
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.project_context') is not null then
    execute 'drop policy if exists "context_all" on project_context';
    execute 'create policy "context_all" on project_context
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.outbound_emails') is not null then
    execute 'drop policy if exists "outbound_emails_all" on outbound_emails';
    execute 'create policy "outbound_emails_all" on outbound_emails
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.reminders')       is not null then
    execute 'drop policy if exists "reminders_all" on reminders';
    execute 'create policy "reminders_all" on reminders
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.weather_logs')    is not null then
    execute 'drop policy if exists "weather_logs_member_read"   on weather_logs';
    execute 'drop policy if exists "weather_logs_member_write"  on weather_logs';
    execute 'drop policy if exists "weather_logs_member_update" on weather_logs';
    execute 'drop policy if exists "weather_logs_all"           on weather_logs';
    execute 'create policy "weather_logs_all" on weather_logs
             for all using (user_can_access_project(project_id))';
  end if;
end$$;
