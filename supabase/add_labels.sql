-- ── Add custom project labels ─────────────────────────────────────────────────
-- Run in Supabase SQL editor to enable per-project labels for field log categorisation.

-- Project labels table
create table if not exists project_labels (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid references projects(id) on delete cascade not null,
  name        text not null,
  color       text default '#6366F1',
  created_at  timestamptz default now(),
  unique(project_id, name)
);

-- RLS
alter table project_labels enable row level security;

create policy "labels_all" on project_labels
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

-- Add label column to field_logs (stores the matched custom label name)
alter table field_logs add column if not exists label text;
