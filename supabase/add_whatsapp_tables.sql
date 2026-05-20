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
