-- Per-workpoint classification + typed outputs + reminders
-- Implements positioning one-pager (mei 2026): each work-point bucketed against signed offerte;
-- outputs split into PV-mail / Werfmail / Reminder; offerte anchored at project level.

-- ── 1. Workpoints on field_logs ──────────────────────────────────────────
-- Each memo now produces an array of {description, classification, reasoning, type}.
-- We keep it as JSONB on the field_log row so we don't need a join table for the common read path.
alter table field_logs
  add column if not exists workpoints jsonb default '[]'::jsonb;

create index if not exists field_logs_workpoints_gin
  on field_logs using gin (workpoints);

-- ── 2. Signed-offerte anchor on projects ─────────────────────────────────
-- Points to the project_context row that is the authoritative signed quote/contract.
-- When null, classification falls back to "twijfel" and the UI prompts the PM to upload.
alter table projects
  add column if not exists signed_offerte_id uuid
    references project_context(id) on delete set null,
  add column if not exists signed_offerte_signed_at date,
  add column if not exists signed_offerte_version text;

-- ── 3. Email type taxonomy on outbound_emails ────────────────────────────
-- Distinguishes the three output kinds the one-pager promises.
-- Skips silently if outbound_emails hasn't been created yet (run add_outbound_emails.sql first).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'outbound_emails'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'outbound_emails' and column_name = 'email_type'
  ) then
    execute $sql$
      alter table outbound_emails
        add column email_type text not null default 'pv_mail'
          check (email_type in ('pv_mail', 'werfmail', 'reminder', 'briefing', 'other'))
    $sql$;
    execute $sql$
      create index if not exists outbound_emails_type_idx
        on outbound_emails (project_id, email_type, sent_at desc)
    $sql$;
  end if;
end$$;

-- ── 4. Reminders table ───────────────────────────────────────────────────
-- Scheduled follow-ups (e.g. "remind onderaannemer about ceiling rectification by Friday").
-- A worker can scan `due_at <= now() and status='pending'` to fire send-email with email_type='reminder'.
create table if not exists reminders (
  id            uuid        default gen_random_uuid() primary key,
  project_id    uuid        references projects(id) on delete cascade not null,
  field_log_id  uuid        references field_logs(id) on delete set null,
  user_id       uuid        references auth.users(id) on delete set null,

  subject       text        not null,
  body          text,
  recipient     text,                                  -- email address or sub name
  recipient_kind text       default 'external'
                  check (recipient_kind in ('external', 'internal')),

  due_at        timestamptz not null,
  sent_at       timestamptz,
  outbound_email_id uuid    references outbound_emails(id) on delete set null,

  status        text        default 'pending'
                  check (status in ('pending', 'sent', 'cancelled', 'failed')),

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists reminders_project_due_idx
  on reminders (project_id, status, due_at);

create index if not exists reminders_field_log_idx
  on reminders (field_log_id);

alter table reminders enable row level security;

drop policy if exists "Members can read project reminders"   on reminders;
drop policy if exists "Members can manage project reminders" on reminders;

create policy "Members can read project reminders"
  on reminders for select
  using (
    project_id in (select project_id from project_members where user_id = auth.uid())
    or user_id = auth.uid()
  );

create policy "Members can manage project reminders"
  on reminders for all
  using (
    project_id in (select project_id from project_members where user_id = auth.uid())
    or user_id = auth.uid()
  )
  with check (
    project_id in (select project_id from project_members where user_id = auth.uid())
    or user_id = auth.uid()
  );
