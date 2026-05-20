-- ── WhatsApp pending-question state ────────────────────────────────────────────
-- Allows the bot to ask a follow-up question after logging a voice note
-- and link the reply to the specific field log it should update.
-- Run in Supabase SQL editor after add_whatsapp_routing.sql

alter table public.wa_sender_state
  add column if not exists pending_question text,          -- e.g. 'location', null when idle
  add column if not exists pending_log_id   uuid references public.field_logs(id) on delete set null;
