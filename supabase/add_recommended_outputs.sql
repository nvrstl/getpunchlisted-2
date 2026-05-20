-- Recommended outputs per memo: AI-generated drafts the PM can send.
-- Each entry is { type, recipientRole, recipient, subject, body, tone, urgency, dueAt, rationale, sent_at? }.
alter table field_logs
  add column if not exists recommended_outputs jsonb default '[]'::jsonb;

create index if not exists field_logs_recommended_outputs_gin
  on field_logs using gin (recommended_outputs);
