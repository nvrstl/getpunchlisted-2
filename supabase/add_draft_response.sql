-- Step 07: Draft antwoord — add draft columns to dispute_points
-- Run in Supabase SQL editor

alter table dispute_points
  add column if not exists draft_response        text,
  add column if not exists draft_generated_at    timestamptz;
