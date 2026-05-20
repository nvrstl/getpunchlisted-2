-- Allow email-sourced field logs to have no project yet (matched later)
alter table field_logs alter column project_id drop not null;

-- AI-extracted action items from the email body
alter table field_logs add column if not exists action_items jsonb default '[]'::jsonb;

-- Origin of the log: 'manual' | 'email' | 'voice'
alter table field_logs add column if not exists source text default 'manual';
