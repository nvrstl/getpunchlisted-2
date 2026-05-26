-- ── Weather + delay log ───────────────────────────────────────────────────────
-- Adds cached geocoded coordinates to projects, and a per-day weather snapshot
-- table used by Daily Reports and delay-claim entries.

alter table projects add column if not exists lat numeric;
alter table projects add column if not exists lon numeric;

create table if not exists weather_logs (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid references projects(id) on delete cascade not null,
  log_date        date not null,
  temp_min_c      numeric,
  temp_max_c      numeric,
  precip_mm       numeric,
  wind_max_kmh    numeric,
  wind_gust_kmh   numeric,
  conditions      text,            -- short label e.g. "Heavy rain", "Clear", "Snow"
  weather_code    int,             -- WMO code from Open-Meteo
  delay_risk      text,            -- none | low | medium | high
  raw_json        jsonb,           -- full API payload for audit/reproducibility
  fetched_at      timestamptz default now(),
  -- One snapshot per project per day
  unique (project_id, log_date)
);

create index if not exists weather_logs_project_date_idx
  on weather_logs (project_id, log_date desc);

-- RLS — same pattern as field_logs: project members may read/write
alter table weather_logs enable row level security;

create policy "weather_logs_member_read"
  on weather_logs for select
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );

create policy "weather_logs_member_write"
  on weather_logs for insert
  with check (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );

create policy "weather_logs_member_update"
  on weather_logs for update
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_members where user_id = auth.uid()
    )
  );
