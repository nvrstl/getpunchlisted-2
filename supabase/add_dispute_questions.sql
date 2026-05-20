-- Dispute questions (Step 05: Gaten identificeren)
-- Run in Supabase SQL editor

create table if not exists dispute_questions (
  id               uuid default gen_random_uuid() primary key,
  dispute_point_id uuid references dispute_points(id) on delete cascade not null,
  question         text not null,
  answer           text,
  created_at       timestamptz default now()
);

alter table dispute_questions enable row level security;

create policy "dispute_questions_all" on dispute_questions
  for all using (
    dispute_point_id in (
      select dp.id from dispute_points dp
      join disputes d on dp.dispute_id = d.id
      where d.project_id in (
        select id from projects where owner_id = auth.uid()
        union
        select project_id from project_members
        where user_id = auth.uid() or email = auth.email()
      )
    )
  );
