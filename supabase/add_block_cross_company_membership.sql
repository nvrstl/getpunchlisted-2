-- ── Block cross-company project memberships ─────────────────────────────────
-- Belt-and-suspenders complement to add_company_isolation.sql: even if some
-- code path tries to add a project_member from a different company than the
-- project's, the DB rejects it. Fires on INSERT and UPDATE so the check
-- also runs when sync-memberships backfills user_id on an email-only invite.
--
-- Skips rows where user_id is null (email-only invite, not yet accepted) or
-- where either side has no company set — those cases are still legal.

create or replace function block_cross_company_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_company uuid;
  v_user_company    uuid;
begin
  if new.user_id is null then
    return new;
  end if;

  select company_id into v_project_company
  from projects
  where id = new.project_id;

  select company_id into v_user_company
  from company_users
  where user_id = new.user_id
  limit 1;

  if v_project_company is not null
     and v_user_company  is not null
     and v_project_company <> v_user_company then
    raise exception
      'User % belongs to company % but project % belongs to company %',
      new.user_id, v_user_company, new.project_id, v_project_company;
  end if;

  return new;
end;
$$;

drop trigger if exists project_members_company_check on project_members;
create trigger project_members_company_check
  before insert or update on project_members
  for each row execute function block_cross_company_membership();

-- ── One-shot cleanup ─────────────────────────────────────────────────────────
-- Remove every existing cross-company membership so the trigger's first
-- pass doesn't get tripped by stale data from before tenant isolation.
delete from project_members pm
using projects p, company_users cu
where pm.project_id  = p.id
  and pm.user_id     = cu.user_id
  and pm.user_id    is not null
  and p.company_id  is not null
  and cu.company_id is distinct from p.company_id;
