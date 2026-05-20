-- ── Project Context (Quotes, Notes, Danger Flags) ────────────────────────────
-- Run this in the Supabase SQL editor to add the context manager feature.

create table project_context (
  id          uuid    default gen_random_uuid() primary key,
  project_id  uuid    references projects(id) on delete cascade not null,
  category    text    not null default 'quote', -- 'quote' | 'note' | 'danger' | 'contract'
  title       text    not null,
  content     text    not null,
  source      text,   -- e.g. "Architect email 2024-03-01", "Contract clause 12.3"
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table project_context enable row level security;

create policy "context_all" on project_context
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
    )
  );

-- Index for fast per-project lookups
create index project_context_project_id_idx on project_context(project_id);
