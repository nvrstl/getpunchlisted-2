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
