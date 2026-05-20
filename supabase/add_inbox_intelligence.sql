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
