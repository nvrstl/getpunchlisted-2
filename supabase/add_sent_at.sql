-- Step 09: Review gate — add sent_at to disputes
-- Run in Supabase SQL editor

alter table disputes
  add column if not exists sent_at timestamptz,
  add column if not exists reviewed_by text;
