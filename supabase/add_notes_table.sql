-- ── notes table — stores inbound email payloads from Mailgun ─────────────────
create table if not exists notes (
  id           uuid        default gen_random_uuid() primary key,
  source       text        not null default 'email',  -- 'email' | future sources
  sender_email text,
  subject      text,
  body         text,
  raw_payload  jsonb,
  created_at   timestamptz default now()
);

-- Allow the service role (used by the edge function) full access.
-- Deny all access to anonymous and authenticated roles by default.
alter table notes enable row level security;

create policy "service role full access"
  on notes
  for all
  to service_role
  using (true)
  with check (true);
