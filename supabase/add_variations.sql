-- ── Excess Works / Variations ───────────────────────────────────────────────
-- Run in Supabase SQL editor: https://app.supabase.com → SQL Editor

-- 1. Variations table
create table if not exists variations (
  id             uuid default gen_random_uuid() primary key,
  project_id     uuid references projects(id) on delete cascade not null,
  field_log_id   uuid references field_logs(id) on delete set null,
  number         text not null,
  description    text not null,
  requested_by   text,
  estimated_cost text,
  status         text not null default 'draft'
                   check (status in ('draft', 'submitted', 'approved', 'invoiced')),
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 2. Track how many variations were auto-created from a field log
alter table field_logs
  add column if not exists variations_created integer default 0;

-- 3. RLS — same pattern as rfis
alter table variations enable row level security;

create policy "Users can manage variations for their projects"
  on variations for all
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
    )
  );
