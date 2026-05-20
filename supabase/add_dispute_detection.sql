-- Dispute detection support on field_logs
-- Run in Supabase SQL editor

-- Array of dispute sub-types found in this log (e.g. ['timing', 'meerwerk'])
-- Only populated when type = 'dispute'
alter table field_logs add column if not exists dispute_types text[] default '{}';
