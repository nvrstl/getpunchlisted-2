-- Project contacts: per-project address book (Klant, Architect, schilder, …)
-- Distinct from project_members (which is auth-linked). These are external people
-- the PM emails / calls during the project.

create table if not exists project_contacts (
  id          uuid        default gen_random_uuid() primary key,
  project_id  uuid        references projects(id) on delete cascade not null,
  name        text        not null,
  role        text,                                  -- 'klant', 'architect', 'schilder', 'loodgieter', 'leverancier', etc.
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists project_contacts_project_idx
  on project_contacts (project_id, created_at desc);

alter table project_contacts enable row level security;

drop policy if exists "Members can manage project_contacts" on project_contacts;

create policy "Members can manage project_contacts"
  on project_contacts for all
  using (
    project_id in (select project_id from project_members where user_id = auth.uid())
    or exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  )
  with check (
    project_id in (select project_id from project_members where user_id = auth.uid())
    or exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  );
