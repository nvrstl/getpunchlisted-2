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
