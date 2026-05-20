-- Site visit summaries — output of the WhatsApp AI pipeline.
-- One row per inbound WhatsApp message that was processed successfully.

create table if not exists site_visit_summaries (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  raw_input    text        not null,           -- original text, transcript, or image caption
  summary      text        not null,           -- Claude's 📋 Summary block
  action_items text        not null default '', -- Claude's ✅ Action items block (bullet list)
  source       text        not null
                 check (source in ('text', 'audio', 'image')),
  created_at   timestamptz default now()
);

-- Fast lookup of a user's summary history in reverse-chronological order
create index if not exists site_visit_summaries_user_id_created_at_idx
  on site_visit_summaries (user_id, created_at desc);

alter table site_visit_summaries enable row level security;

-- Users can only read their own summaries; the server (service role) handles inserts
create policy "Users can read their own site_visit_summaries"
  on site_visit_summaries for select
  using (user_id = auth.uid());

create policy "Service role inserts site_visit_summaries"
  on site_visit_summaries for insert
  with check (false);   -- direct client inserts blocked; worker uses service_role key
