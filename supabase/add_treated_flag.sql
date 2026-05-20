-- Add treated column to field_logs to track which logs have been analysed and acted upon
alter table field_logs add column if not exists treated boolean not null default false;
