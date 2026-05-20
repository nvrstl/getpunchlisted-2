-- Add log_date column to field_logs for AI-extracted date from note content
alter table field_logs add column if not exists log_date date;
