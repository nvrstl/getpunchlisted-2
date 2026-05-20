-- Disputes & dispute points
-- Run in Supabase SQL editor

create table if not exists disputes (
  id           uuid default gen_random_uuid() primary key,
  project_id   uuid references projects(id) on delete cascade not null,
  field_log_id uuid references field_logs(id) on delete set null,
  number       text,
  sender_email text,
  subject      text,
  status       text default 'open',
  -- open | awaiting_pm | draft_ready | under_review | sent | archived
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists dispute_points (
  id                          uuid default gen_random_uuid() primary key,
  dispute_id                  uuid references disputes(id) on delete cascade not null,
  type                        text not null,
  -- timing | meerwerk | kwaliteit | betaling | other
  description                 text,
  timeline_reconstruction     text,
  timeline_reconstructed_at   timestamptz,
  created_at                  timestamptz default now()
);

-- RLS
alter table disputes       enable row level security;
alter table dispute_points enable row level security;

create policy "disputes_all" on disputes
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members
      where user_id = auth.uid() or email = auth.email()
    )
  );

create policy "dispute_points_all" on dispute_points
  for all using (
    dispute_id in (
      select id from disputes where project_id in (
        select id from projects where owner_id = auth.uid()
        union
        select project_id from project_members
        where user_id = auth.uid() or email = auth.email()
      )
    )
  );
