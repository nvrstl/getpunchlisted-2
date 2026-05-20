-- Add MEERWERK classification columns to field_logs
-- Run in Supabase SQL editor

alter table field_logs
  add column if not exists meerwerk_classification text,      -- in_scope | meerwerk | twijfel
  add column if not exists meerwerk_reasoning      text;      -- short NL explanation from AI
