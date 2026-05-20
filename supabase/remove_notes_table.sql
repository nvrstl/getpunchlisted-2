-- Move all email data into field_logs; notes table is no longer needed.

-- Subject line from the inbound email
alter table field_logs add column if not exists subject text;

-- Full raw Mailgun payload stored as JSONB
alter table field_logs add column if not exists raw_payload jsonb;

-- Drop the notes table (and its RLS policies) — superseded by field_logs
drop table if exists notes cascade;
