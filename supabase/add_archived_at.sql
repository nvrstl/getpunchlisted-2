-- Step 10: Tijdslijn-archief — add archived_at to disputes
-- Run in Supabase SQL editor

alter table disputes
  add column if not exists archived_at timestamptz;
