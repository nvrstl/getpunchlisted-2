-- ============================================================
-- Punchlister — consolidated migrations
-- Generated: 2026-05-29 09:10:47 UTC
-- Paste into Supabase SQL editor on a FRESH project.
-- ============================================================

-- ────────── supabase/schema.sql ──────────
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


-- ────────── supabase/add_companies.sql ──────────
-- ── Punchlister — Backoffice / Multi-tenancy Migration ────────────────────────
-- Run in Supabase SQL Editor: https://app.supabase.com → SQL Editor

-- Companies (tenants)
create table if not exists companies (
  id             uuid default gen_random_uuid() primary key,
  name           text not null,
  vat_number     text,                        -- Belgian format: BE0xxx.xxx.xxx
  email          text not null,
  phone          text,
  address_street text,
  address_zip    text,
  address_city   text,
  notes          text,
  status         text default 'active',       -- active | inactive
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Platform admins (super-admins who can access the backoffice)
create table if not exists platform_admins (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now()
);

-- Company members (links Supabase users/invitees to companies)
create table if not exists company_users (
  id          uuid default gen_random_uuid() primary key,
  company_id  uuid references companies(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  role        text default 'member',          -- owner | admin | member
  invited_at  timestamptz default now(),
  accepted_at timestamptz,
  unique(company_id, email)
);

-- Link projects to companies (nullable — existing projects unaffected)
alter table projects add column if not exists company_id uuid references companies(id) on delete set null;

-- ── RLS ───────────────────────────────────────────────────────────────────────

-- platform_admins: authenticated users can check their own status
alter table platform_admins enable row level security;

drop policy if exists "users can check own admin status" on platform_admins;
create policy "users can check own admin status" on platform_admins
  for select using (auth.uid() = user_id);

-- companies: no anon/user access — all reads/writes go through the backend (service role bypasses RLS)
alter table companies enable row level security;

-- company_users: no anon/user access — backend only
alter table company_users enable row level security;

-- ── Register yourself as a platform admin ────────────────────────────────────
-- Replace the UUID below with your actual Supabase auth user ID.
-- Find it in: Supabase Dashboard → Authentication → Users
--
-- insert into platform_admins (user_id) values ('YOUR-USER-UUID-HERE')
-- on conflict (user_id) do nothing;


-- ────────── supabase/add_context.sql ──────────
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


-- ────────── supabase/add_disputes.sql ──────────
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


-- ────────── supabase/add_variations.sql ──────────
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


-- ────────── supabase/add_dispute_evidence.sql ──────────
-- Dispute evidence bundles (Step 06: Bewijsstuk-bundeling)
-- Run in Supabase SQL editor

create table if not exists dispute_evidence (
  id               uuid default gen_random_uuid() primary key,
  dispute_point_id uuid references dispute_points(id) on delete cascade not null,
  source_type      text not null,   -- field_log | rfi | variation
  source_id        uuid not null,
  label            text,
  relevance_note   text,
  created_at       timestamptz default now()
);

alter table dispute_evidence enable row level security;

create policy "dispute_evidence_all" on dispute_evidence
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


-- ────────── supabase/add_dispute_questions.sql ──────────
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


-- ────────── supabase/add_outbound_emails.sql ──────────
-- Outbound email tracking: every email sent from Punchlister gets a row here.
-- Used by the "Verzonden" tab in Vandaag and the project-level mail thread view.

create table if not exists outbound_emails (
  id              uuid        default gen_random_uuid() primary key,
  project_id      uuid        references projects(id) on delete cascade,
  user_id         uuid        references auth.users(id) on delete set null,

  -- Source link: at most one of these will be set
  field_log_id    uuid        references field_logs(id) on delete set null,
  rfi_id          uuid        references rfis(id)       on delete set null,
  variation_id    uuid        references variations(id) on delete set null,
  dispute_id      uuid        references disputes(id)   on delete set null,

  -- Envelope
  to_addresses    text[]      not null,
  cc_addresses    text[]      default '{}',
  bcc_addresses   text[]      default '{}',
  reply_to        text,
  subject         text        not null,

  -- Body (we store both for indexing + replay)
  body_text       text,
  body_html       text,

  -- Provider metadata
  provider        text        default 'mailgun',
  message_id      text,            -- provider message id, for tracking replies
  status          text        not null default 'sent'
                    check (status in ('sent', 'failed', 'queued', 'opened', 'replied')),
  error           text,            -- populated when status='failed'

  -- Timestamps
  sent_at         timestamptz default now(),
  opened_at       timestamptz,
  replied_at      timestamptz,
  created_at      timestamptz default now()
);

create index if not exists outbound_emails_project_id_idx
  on outbound_emails (project_id, sent_at desc);

create index if not exists outbound_emails_field_log_id_idx
  on outbound_emails (field_log_id);

create index if not exists outbound_emails_rfi_id_idx
  on outbound_emails (rfi_id);

create index if not exists outbound_emails_dispute_id_idx
  on outbound_emails (dispute_id);

create index if not exists outbound_emails_message_id_idx
  on outbound_emails (message_id);

alter table outbound_emails enable row level security;

drop policy if exists "Members can read their project's outbound_emails" on outbound_emails;
drop policy if exists "Service role inserts outbound_emails"             on outbound_emails;
drop policy if exists "Service role updates outbound_emails"             on outbound_emails;

-- Users can read emails for projects they're a member of
create policy "Members can read their project's outbound_emails"
  on outbound_emails for select
  using (
    project_id in (
      select project_id from project_members where user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- Service role inserts; clients cannot insert directly (server-only audit trail)
create policy "Service role inserts outbound_emails"
  on outbound_emails for insert
  with check (false);

-- Service role updates status (replies, opens). Clients can't tamper.
create policy "Service role updates outbound_emails"
  on outbound_emails for update
  using (false)
  with check (false);


-- ────────── supabase/add_workpoints_and_outputs.sql ──────────
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


-- ────────── supabase/add_inbox_intelligence.sql ──────────
-- Inbox intelligence: snooze, reply-threading, deadline awareness.

-- ── 1. Snooze ───────────────────────────────────────────────────────────────
-- A memo with snoozed_until > now() is hidden from the inbox until that time.
alter table field_logs
  add column if not exists snoozed_until timestamptz;

create index if not exists field_logs_snoozed_until_idx
  on field_logs (project_id, snoozed_until)
  where snoozed_until is not null;

-- ── 2. Reply threading ──────────────────────────────────────────────────────
-- When an inbound email (via Mailgun) is a reply to a previously-sent outbound
-- email, link the resulting field_log to the original outbound and stamp the
-- outbound with last_reply_at so the UI can surface "ANTWOORD ONTVANGEN".
alter table field_logs
  add column if not exists in_reply_to_message_id text,
  add column if not exists parent_outbound_email_id uuid
    references outbound_emails(id) on delete set null;

create index if not exists field_logs_parent_outbound_email_idx
  on field_logs (parent_outbound_email_id)
  where parent_outbound_email_id is not null;

alter table outbound_emails
  add column if not exists last_reply_at timestamptz;

-- ── 3. Aging — no schema change needed ──────────────────────────────────────
-- We derive "wacht > 3 dagen" from created_at + treated, and "verstreken"
-- from log_date < now(), both already on field_logs.


-- ────────── supabase/add_whatsapp_tables.sql ──────────
-- WhatsApp integration tables
-- phone_number and to_number are AES-256 encrypted at the application layer before storage;
-- the columns store the ciphertext as text (base64-encoded).

-- ─────────────────────────────────────────
-- 1. whatsapp_users
-- ─────────────────────────────────────────
create table if not exists whatsapp_users (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references auth.users(id) on delete cascade not null,
  phone_number     text        not null,                          -- AES-256 encrypted ciphertext
  opted_in_at      timestamptz,                                   -- null until user opts in
  last_inbound_at  timestamptz,                                   -- tracks 24 h free-messaging window
  status           text        not null default 'pending'
                     check (status in ('pending', 'active', 'blocked')),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Each Supabase auth user may have at most one WhatsApp record
create unique index if not exists whatsapp_users_user_id_key
  on whatsapp_users (user_id);

alter table whatsapp_users enable row level security;

-- Users can only read/write their own row
create policy "Users can manage their own whatsapp_users row"
  on whatsapp_users for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────
-- 2. outbound_messages  (GDPR audit trail)
-- ─────────────────────────────────────────
create table if not exists outbound_messages (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  to_number     text        not null,                             -- AES-256 encrypted ciphertext
  message_type  text        not null
                  check (message_type in ('text', 'template')),
  template_name text,                                             -- null for plain text messages
  sent_at       timestamptz not null default now(),
  status        text        not null default 'sent'
                  check (status in ('sent', 'failed')),
  created_at    timestamptz default now()
);

alter table outbound_messages enable row level security;

-- Users can only read their own outbound message records
create policy "Users can read their own outbound_messages"
  on outbound_messages for select
  using (user_id = auth.uid());

-- Service role (server-side) handles inserts; deny direct client inserts
create policy "Service role inserts outbound_messages"
  on outbound_messages for insert
  with check (false);   -- client cannot insert; server uses service_role key


-- ────────── supabase/add_whatsapp_routing.sql ──────────
-- ── WhatsApp multi-project routing ────────────────────────────────────────────
-- Run in Supabase SQL editor to enable per-sender project routing.

set search_path = public;

-- 1. Link a team member's WhatsApp number to their project_members row.
--    The PM fills this in when adding a member via Project Settings.
alter table public.project_members
  add column if not exists whatsapp_phone text;

-- 2. Active-session state: stores which project each WhatsApp sender is
--    currently routing to (set by text command "project [name]").
create table if not exists public.wa_sender_state (
  phone_number  text primary key,
  project_id    uuid references public.projects(id) on delete set null,
  updated_at    timestamptz default now()
);

-- No RLS needed — only the service-role key (server-side) reads/writes this table.
-- If you want row-level access for debugging, enable it here:
-- alter table public.wa_sender_state enable row level security;


-- ────────── supabase/add_wa_pending_state.sql ──────────
-- ── WhatsApp pending-question state ────────────────────────────────────────────
-- Allows the bot to ask a follow-up question after logging a voice note
-- and link the reply to the specific field log it should update.
-- Run in Supabase SQL editor after add_whatsapp_routing.sql

alter table public.wa_sender_state
  add column if not exists pending_question text,          -- e.g. 'location', null when idle
  add column if not exists pending_log_id   uuid references public.field_logs(id) on delete set null;


-- ────────── supabase/add_archived_at.sql ──────────
-- Step 10: Tijdslijn-archief — add archived_at to disputes
-- Run in Supabase SQL editor

alter table disputes
  add column if not exists archived_at timestamptz;


-- ────────── supabase/add_block_cross_company_membership.sql ──────────
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


-- ────────── supabase/add_company_isolation.sql ──────────
-- ── Company-based tenant isolation ────────────────────────────────────────────
-- A user may see / interact with a project ONLY when one of the following is
-- true:
--   1. They are the project owner.
--   2. They have an accepted project_members row for that project.
--   3. They belong to the same company as the project (via company_users).
--
-- This file:
--   • introduces a single security-definer helper user_can_access_project()
--     so every per-project policy stays consistent;
--   • rewrites the RLS policies on projects + all per-project child tables;
--   • adds a BEFORE INSERT trigger on projects that auto-stamps company_id
--     from the creator's company_users row, and rejects inserts when the
--     creator has no company. Keeps platform_admins able to create
--     unattached projects via the backoffice (the service role bypasses RLS
--     and triggers fired by SECURITY DEFINER functions can opt out).
--
-- Safe to re-run: every CREATE is preceded by DROP IF EXISTS.

-- ── Access helper ─────────────────────────────────────────────────────────────

create or replace function user_can_access_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and (
        pr.owner_id = auth.uid()
        or exists (
          select 1 from project_members pm
          where pm.project_id = p and pm.user_id = auth.uid()
        )
        or (
          pr.company_id is not null
          and pr.company_id in (
            select company_id from company_users cu where cu.user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function user_can_access_project(uuid) from public;
grant execute on function user_can_access_project(uuid) to authenticated;

-- ── projects: rewrite select policy ──────────────────────────────────────────
-- IMPORTANT: must use user_can_access_project() (SECURITY DEFINER) instead of
-- inline subqueries. The existing project_members policy subqueries projects,
-- so an inline subquery here creates a cycle that Postgres rejects with a
-- 500 at query time. SECURITY DEFINER bypasses RLS inside the function, so
-- the cycle is broken.

drop policy if exists "project_select" on projects;
create policy "project_select" on projects
  for select
  using (user_can_access_project(id));

-- ── Auto-stamp company_id on insert + require it ─────────────────────────────

create or replace function stamp_project_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  -- If a company_id was supplied by the caller, trust it (admin / service role).
  if new.company_id is not null then
    return new;
  end if;
  -- Resolve the creator's company from company_users.
  select company_id into v_company
  from company_users
  where user_id = new.owner_id
  limit 1;

  if v_company is null then
    raise exception 'Cannot create a project: owner is not assigned to a company. Ask a platform admin to add you to a company first.';
  end if;

  new.company_id := v_company;
  return new;
end;
$$;

drop trigger if exists projects_stamp_company on projects;
create trigger projects_stamp_company
  before insert on projects
  for each row execute function stamp_project_company();

-- ── Rewrite per-project child table policies to use the helper ───────────────

drop policy if exists "field_logs_all"     on field_logs;
create policy "field_logs_all" on field_logs
  for all using (user_can_access_project(project_id));

drop policy if exists "rfis_all"           on rfis;
create policy "rfis_all" on rfis
  for all using (user_can_access_project(project_id));

drop policy if exists "punch_items_all"    on punch_items;
create policy "punch_items_all" on punch_items
  for all using (user_can_access_project(project_id));

drop policy if exists "subcontractors_all" on subcontractors;
create policy "subcontractors_all" on subcontractors
  for all using (user_can_access_project(project_id));

-- Optional tables — only create the policy if the table exists in this DB
do $$
begin
  if to_regclass('public.variations')      is not null then
    execute 'drop policy if exists "variations_all" on variations';
    execute 'create policy "variations_all" on variations
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.disputes')        is not null then
    execute 'drop policy if exists "disputes_all" on disputes';
    execute 'create policy "disputes_all" on disputes
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.project_context') is not null then
    execute 'drop policy if exists "context_all" on project_context';
    execute 'create policy "context_all" on project_context
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.outbound_emails') is not null then
    execute 'drop policy if exists "outbound_emails_all" on outbound_emails';
    execute 'create policy "outbound_emails_all" on outbound_emails
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.reminders')       is not null then
    execute 'drop policy if exists "reminders_all" on reminders';
    execute 'create policy "reminders_all" on reminders
             for all using (user_can_access_project(project_id))';
  end if;

  if to_regclass('public.weather_logs')    is not null then
    execute 'drop policy if exists "weather_logs_member_read"   on weather_logs';
    execute 'drop policy if exists "weather_logs_member_write"  on weather_logs';
    execute 'drop policy if exists "weather_logs_member_update" on weather_logs';
    execute 'drop policy if exists "weather_logs_all"           on weather_logs';
    execute 'create policy "weather_logs_all" on weather_logs
             for all using (user_can_access_project(project_id))';
  end if;
end$$;


-- ────────── supabase/add_company_user_self_read.sql ──────────
-- ── Let a user read their own company membership ─────────────────────────────
-- company_users was originally locked to service-role only. Project creation
-- needs the frontend to know which company the creator belongs to so it can
-- stamp company_id on the new project row. Reading your own membership row
-- isn't sensitive; reading other users' memberships still requires the
-- backend / service-role key.

drop policy if exists "users can read own company membership" on company_users;
create policy "users can read own company membership"
  on company_users
  for select
  using (user_id = auth.uid());


-- ────────── supabase/add_contacts.sql ──────────
-- Add role-based contact fields to projects
-- Run in Supabase SQL Editor: Dashboard → SQL Editor

alter table projects add column if not exists bouwheer_name  text;
alter table projects add column if not exists bouwheer_email text;
alter table projects add column if not exists architect_name  text;
alter table projects add column if not exists architect_email text;
alter table projects add column if not exists calculator_name  text;
alter table projects add column if not exists calculator_email text;


-- ────────── supabase/add_context_chunks.sql ──────────
-- ── pgvector + context_chunks ────────────────────────────────────────────────
-- Per-chunk embeddings for project_context rows. Lets the chat do semantic
-- retrieval across multi-hundred-page documents instead of the keyword
-- fallback in api/project-chat.js.
--
-- Embedding model: OpenAI text-embedding-3-small → 1536 dims.
-- Distance: cosine (<=> operator on the embedding column).
--
-- Safe to re-run.

create extension if not exists vector;

create table if not exists context_chunks (
  id                  uuid default gen_random_uuid() primary key,
  project_context_id  uuid references project_context(id) on delete cascade not null,
  project_id          uuid references projects(id)        on delete cascade not null,
  chunk_idx           int  not null,
  text                text not null,
  embedding           vector(1536),
  created_at          timestamptz default now(),
  unique (project_context_id, chunk_idx)
);

-- Per-project filtered cosine search is the hot query — index on project_id
-- as a btree, embedding with HNSW for fast nearest-neighbour lookup.
create index if not exists context_chunks_project_idx
  on context_chunks (project_id);

create index if not exists context_chunks_embedding_idx
  on context_chunks using hnsw (embedding vector_cosine_ops);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Chunks inherit visibility from their project. Use the same user_can_access_project()
-- helper that backs every other per-project table.
alter table context_chunks enable row level security;

drop policy if exists "context_chunks_all" on context_chunks;
create policy "context_chunks_all" on context_chunks
  for all using (user_can_access_project(project_id));

-- ── Search function ──────────────────────────────────────────────────────────
-- Returns top-K chunks for a project, ranked by cosine similarity to the
-- supplied query embedding. Wrapped as a function so the chat handler can
-- call it with a single rpc('match_context_chunks', ...) instead of building
-- raw vector SQL on the client.
create or replace function match_context_chunks(
  p_project_id  uuid,
  p_embedding   vector(1536),
  p_match_count int default 20
)
returns table (
  chunk_id           uuid,
  project_context_id uuid,
  text               text,
  similarity         float
)
language sql
stable
as $$
  select
    cc.id                  as chunk_id,
    cc.project_context_id  as project_context_id,
    cc.text                as text,
    1 - (cc.embedding <=> p_embedding) as similarity
  from context_chunks cc
  where cc.project_id = p_project_id
    and cc.embedding is not null
  order by cc.embedding <=> p_embedding
  limit p_match_count;
$$;


-- ────────── supabase/add_context_raw_text.sql ──────────
-- ── Full raw text on project_context ─────────────────────────────────────────
-- project_context.content currently stores an AI-generated summary + key
-- points. That's enough for high-level project Q&A but means the chat can't
-- quote clauses verbatim. Add raw_text to hold the original extracted text
-- (PDF body, email body, etc.) so the chat can pull exact wording.
--
-- Nullable + safe to leave NULL on legacy rows; chats fall back to content.

alter table project_context add column if not exists raw_text text;


-- ────────── supabase/add_dispute_detection.sql ──────────
-- Dispute detection support on field_logs
-- Run in Supabase SQL editor

-- Array of dispute sub-types found in this log (e.g. ['timing', 'meerwerk'])
-- Only populated when type = 'dispute'
alter table field_logs add column if not exists dispute_types text[] default '{}';


-- ────────── supabase/add_draft_response.sql ──────────
-- Step 07: Draft antwoord — add draft columns to dispute_points
-- Run in Supabase SQL editor

alter table dispute_points
  add column if not exists draft_response        text,
  add column if not exists draft_generated_at    timestamptz;


-- ────────── supabase/add_embedding_timeout.sql ──────────
-- ── Bump statement_timeout for embedding inserts ─────────────────────────────
-- Service-role default is 30s on Supabase. HNSW index updates while bulk
-- inserting hundreds of context_chunks rows (one per ~1200-char document
-- chunk) can exceed that on a hot table. Raise to 120s so large documents
-- (5k+ chunks) still embed without 'canceling statement due to statement
-- timeout' errors.
--
-- Safe to re-run.

alter role service_role set statement_timeout = '120s';

-- The change applies to NEW connections via PgBouncer/pooler. Force a
-- pool reset to ensure existing pooled connections pick it up.
select pg_reload_conf();


-- ────────── supabase/add_field_log_email_support.sql ──────────
-- Allow email-sourced field logs to have no project yet (matched later)
alter table field_logs alter column project_id drop not null;

-- AI-extracted action items from the email body
alter table field_logs add column if not exists action_items jsonb default '[]'::jsonb;

-- Origin of the log: 'manual' | 'email' | 'voice'
alter table field_logs add column if not exists source text default 'manual';


-- ────────── supabase/add_keyword_chunk_search.sql ──────────
-- ── Keyword substring search over context_chunks ────────────────────────────
-- Vector similarity misses chunks that mention specific terms (brand names,
-- artikelnummers, product codes) but score low semantically. This function
-- scans every chunk in the project for substring matches and returns the
-- ones that hit any of the supplied keywords, ranked by how many hits.
-- Combined with the vector RPC in retrieval.js, the chat now sees both
-- semantically relevant chunks AND chunks that literally contain the
-- user's keywords.
--
-- Safe to re-run.

create or replace function search_chunks_by_keywords(
  p_project_id  uuid,
  p_keywords    text[],
  p_match_count int default 30
)
returns table (
  chunk_id           uuid,
  project_context_id uuid,
  text               text,
  similarity         float
)
language sql
stable
as $$
  select
    cc.id                  as chunk_id,
    cc.project_context_id  as project_context_id,
    cc.text                as text,
    -- Hit count is treated as a pseudo-similarity score so the calling
    -- code can merge results with the vector pool uniformly. Normalised
    -- to roughly the cosine-similarity 0..1 range by dividing by the
    -- number of keywords searched (so a chunk that matches every term
    -- gets 1.0).
    (
      coalesce((
        select sum(case when cc.text ilike '%' || k || '%' then 1 else 0 end)::float
        from unnest(p_keywords) k
      ), 0)
      / greatest(array_length(p_keywords, 1), 1)::float
    ) as similarity
  from context_chunks cc
  where cc.project_id = p_project_id
    and exists (
      select 1 from unnest(p_keywords) k where cc.text ilike '%' || k || '%'
    )
  order by similarity desc, cc.chunk_idx asc
  limit p_match_count;
$$;


-- ────────── supabase/add_labels.sql ──────────
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


-- ────────── supabase/add_log_date.sql ──────────
-- Add log_date column to field_logs for AI-extracted date from note content
alter table field_logs add column if not exists log_date date;


-- ────────── supabase/add_meerwerk_classification.sql ──────────
-- Add MEERWERK classification columns to field_logs
-- Run in Supabase SQL editor

alter table field_logs
  add column if not exists meerwerk_classification text,      -- in_scope | meerwerk | twijfel
  add column if not exists meerwerk_reasoning      text;      -- short NL explanation from AI


-- ────────── supabase/add_notes_table.sql ──────────
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


-- ────────── supabase/add_project_contacts.sql ──────────
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


-- ────────── supabase/add_recommended_outputs.sql ──────────
-- Recommended outputs per memo: AI-generated drafts the PM can send.
-- Each entry is { type, recipientRole, recipient, subject, body, tone, urgency, dueAt, rationale, sent_at? }.
alter table field_logs
  add column if not exists recommended_outputs jsonb default '[]'::jsonb;

create index if not exists field_logs_recommended_outputs_gin
  on field_logs using gin (recommended_outputs);


-- ────────── supabase/add_sent_at.sql ──────────
-- Step 09: Review gate — add sent_at to disputes
-- Run in Supabase SQL editor

alter table disputes
  add column if not exists sent_at timestamptz,
  add column if not exists reviewed_by text;


-- ────────── supabase/add_site_visit_summaries.sql ──────────
-- Site visit summaries — output of the WhatsApp AI pipeline.
-- One row per inbound WhatsApp message that was processed successfully.

create table if not exists site_visit_summaries (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  raw_input    text        not null,           -- original text, transcript, or image caption
  summary      text        not null,           -- Claude's 📋 Summary block
  action_items text        not null default '', -- Claude's ✅ Action items block (bullet list)
  source       text        not null
                 check (source in ('text', 'audio', 'image')),
  created_at   timestamptz default now()
);

-- Fast lookup of a user's summary history in reverse-chronological order
create index if not exists site_visit_summaries_user_id_created_at_idx
  on site_visit_summaries (user_id, created_at desc);

alter table site_visit_summaries enable row level security;

-- Users can only read their own summaries; the server (service role) handles inserts
create policy "Users can read their own site_visit_summaries"
  on site_visit_summaries for select
  using (user_id = auth.uid());

create policy "Service role inserts site_visit_summaries"
  on site_visit_summaries for insert
  with check (false);   -- direct client inserts blocked; worker uses service_role key


-- ────────── supabase/add_treated_flag.sql ──────────
-- Add treated column to field_logs to track which logs have been analysed and acted upon
alter table field_logs add column if not exists treated boolean not null default false;


-- ────────── supabase/add_weather.sql ──────────
-- ── Weather + delay log ───────────────────────────────────────────────────────
-- Adds cached geocoded coordinates to projects, and a per-day weather snapshot
-- table used by Daily Reports and delay-claim entries.

alter table projects add column if not exists lat numeric;
alter table projects add column if not exists lon numeric;

create table if not exists weather_logs (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid references projects(id) on delete cascade not null,
  log_date        date not null,
  temp_min_c      numeric,
  temp_max_c      numeric,
  precip_mm       numeric,
  wind_max_kmh    numeric,
  wind_gust_kmh   numeric,
  conditions      text,            -- short label e.g. "Heavy rain", "Clear", "Snow"
  weather_code    int,             -- WMO code from Open-Meteo
  delay_risk      text,            -- none | low | medium | high
  raw_json        jsonb,           -- full API payload for audit/reproducibility
  fetched_at      timestamptz default now(),
  -- One snapshot per project per day
  unique (project_id, log_date)
);

create index if not exists weather_logs_project_date_idx
  on weather_logs (project_id, log_date desc);

-- RLS — same pattern as field_logs: project members may read/write
alter table weather_logs enable row level security;

create policy "weather_logs_member_read"
  on weather_logs for select
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );

create policy "weather_logs_member_write"
  on weather_logs for insert
  with check (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );

create policy "weather_logs_member_update"
  on weather_logs for update
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );


-- ────────── supabase/add_whatsapp_source.sql ──────────
-- No schema change needed: the 'source' column on field_logs has no check constraint,
-- so 'whatsapp' is already a valid value alongside 'manual' and 'email'.
--
-- This file documents the expected source values for reference:
--   'manual'   — created in the web app
--   'email'    — received via Mailgun inbound-email edge function
--   'whatsapp' — received via inbound-whatsapp edge function
--
-- Run this if you want to add a check constraint (optional — locks existing rows):
-- alter table field_logs
--   drop constraint if exists field_logs_source_check;
-- alter table field_logs
--   add constraint field_logs_source_check
--   check (source in ('manual', 'email', 'whatsapp', 'voice'));


-- ────────── supabase/remove_notes_table.sql ──────────
-- Move all email data into field_logs; notes table is no longer needed.

-- Subject line from the inbound email
alter table field_logs add column if not exists subject text;

-- Full raw Mailgun payload stored as JSONB
alter table field_logs add column if not exists raw_payload jsonb;

-- Drop the notes table (and its RLS policies) — superseded by field_logs
drop table if exists notes cascade;

