-- ── Punchlister — Supabase Schema ─────────────────────────────────────────────
-- Run this in the Supabase SQL editor: https://app.supabase.com → SQL Editor

-- Projects
create table projects (
  id                  uuid default gen_random_uuid() primary key,
  name                text not null,
  description         text,
  owner_id            uuid references auth.users(id) on delete cascade not null,
  created_at          timestamptz default now(),
  -- Project details
  project_number      text,
  status              text default 'active',   -- pre_construction | active | punch_phase | completed
  client_name         text,
  project_manager     text,
  city                text,
  start_date          date,
  planned_completion  date,
  actual_completion   date,
  contract_value      numeric,
  -- Role-based contacts
  bouwheer_name       text,
  bouwheer_email      text,
  architect_name      text,
  architect_email     text,
  calculator_name     text,
  calculator_email    text
);

-- ── Migration (run if table already exists) ─────────────────────────────────
-- alter table projects add column if not exists project_number     text;
-- alter table projects add column if not exists status             text default 'active';
-- alter table projects add column if not exists client_name        text;
-- alter table projects add column if not exists project_manager    text;
-- alter table projects add column if not exists city               text;
-- alter table projects add column if not exists start_date         date;
-- alter table projects add column if not exists planned_completion date;
-- alter table projects add column if not exists actual_completion  date;
-- alter table projects add column if not exists contract_value     numeric;
-- alter table projects add column if not exists bouwheer_name      text;
-- alter table projects add column if not exists bouwheer_email     text;
-- alter table projects add column if not exists architect_name     text;
-- alter table projects add column if not exists architect_email    text;
-- alter table projects add column if not exists calculator_name    text;
-- alter table projects add column if not exists calculator_email   text;

-- Field Logs
create table field_logs (
  id                uuid    default gen_random_uuid() primary key,
  project_id        uuid    references projects(id) on delete cascade not null,
  user_id           uuid    references auth.users(id) on delete set null,
  user_email        text,
  raw_note          text    not null,
  location          text,
  photo_url         text,    -- base64 for now; migrate to Supabase Storage later
  processed_summary text,
  type              text    default 'general',
  flags             text[]  default '{}',
  impact            text    default 'none',
  action_required   boolean default false,
  suggest_rfi       boolean default false,
  processing        boolean default false,
  created_at        timestamptz default now()
);

-- RFIs
create table rfis (
  id                   uuid default gen_random_uuid() primary key,
  project_id           uuid references projects(id) on delete cascade not null,
  number               text,
  title                text not null,
  context              text,
  draft                text,
  email_draft          text,
  pricing_proposition  text,
  status               text default 'draft',
  field_log_id         uuid references field_logs(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ── Migration (run if table already exists) ─────────────────────────────────
alter table rfis add column if not exists email_draft         text;
alter table rfis add column if not exists pricing_proposition text;

-- Punch Items
create table punch_items (
  id           uuid default gen_random_uuid() primary key,
  project_id   uuid references projects(id) on delete cascade not null,
  task         text not null,
  assignee     text,
  priority     text default 'medium',
  due_date     date,
  notes        text,
  status       text default 'pending',
  category     text,
  created_at   timestamptz default now(),
  completed_at timestamptz
);

-- ── Migration (run if table already exists) ─────────────────────────────────
-- alter table punch_items add column if not exists category text;

-- Subcontractors
create table subcontractors (
  id         uuid    default gen_random_uuid() primary key,
  project_id uuid    references projects(id) on delete cascade not null,
  company    text    not null,
  trade      text,
  contact    text,
  phone      text,
  crew_size  integer default 0,
  work_area  text,
  status     text    default 'on_site',
  notes      text,
  created_at timestamptz default now()
);

-- Project Members (invite by email; user_id auto-filled on sign-in via trigger)
create table project_members (
  id         uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade,
  email      text not null,
  role       text default 'member',   -- 'owner' | 'member'
  created_at timestamptz default now(),
  unique(project_id, email)
);

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table projects       enable row level security;
alter table field_logs     enable row level security;
alter table rfis           enable row level security;
alter table punch_items    enable row level security;
alter table subcontractors enable row level security;
alter table project_members enable row level security;

-- Helper: projects the current user can access (owns OR is a member of)
-- Used inline below to avoid a view dependency.

-- Projects: owners can do everything; members can only read
create policy "project_select" on projects
  for select using (
    owner_id = auth.uid()
    or id in (
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );
create policy "project_insert" on projects
  for insert with check (owner_id = auth.uid());
create policy "project_update" on projects
  for update using (owner_id = auth.uid());
create policy "project_delete" on projects
  for delete using (owner_id = auth.uid());

-- Shared helper expression (inline) for related tables
create policy "field_logs_all" on field_logs
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

create policy "rfis_all" on rfis
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

create policy "punch_items_all" on punch_items
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

create policy "subcontractors_all" on subcontractors
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

-- project_members: owners manage; members can see their own row
create policy "members_select" on project_members
  for select using (
    project_id in (select id from projects where owner_id = auth.uid())
    or user_id = auth.uid()
    or email = auth.email()
  );
create policy "members_insert" on project_members
  for insert with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );
create policy "members_delete" on project_members
  for delete using (
    project_id in (select id from projects where owner_id = auth.uid())
  );
