-- ── Punchlister — Backoffice / Multi-tenancy Migration ────────────────────────
-- Run in Supabase SQL Editor: https://app.supabase.com → SQL Editor

-- Companies (tenants)
create table if not exists companies (
  id             uuid default gen_random_uuid() primary key,
  name           text not null,
  vat_number     text,                        -- Belgian format: BE0xxx.xxx.xxx
  email          text not null,
  phone          text,
  address_street text,
  address_zip    text,
  address_city   text,
  notes          text,
  status         text default 'active',       -- active | inactive
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Platform admins (super-admins who can access the backoffice)
create table if not exists platform_admins (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now()
);

-- Company members (links Supabase users/invitees to companies)
create table if not exists company_users (
  id          uuid default gen_random_uuid() primary key,
  company_id  uuid references companies(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  role        text default 'member',          -- owner | admin | member
  invited_at  timestamptz default now(),
  accepted_at timestamptz,
  unique(company_id, email)
);

-- Link projects to companies (nullable — existing projects unaffected)
alter table projects add column if not exists company_id uuid references companies(id) on delete set null;

-- ── RLS ───────────────────────────────────────────────────────────────────────

-- platform_admins: authenticated users can check their own status
alter table platform_admins enable row level security;

drop policy if exists "users can check own admin status" on platform_admins;
create policy "users can check own admin status" on platform_admins
  for select using (auth.uid() = user_id);

-- companies: no anon/user access — all reads/writes go through the backend (service role bypasses RLS)
alter table companies enable row level security;

-- company_users: no anon/user access — backend only
alter table company_users enable row level security;

-- ── Register yourself as a platform admin ────────────────────────────────────
-- Replace the UUID below with your actual Supabase auth user ID.
-- Find it in: Supabase Dashboard → Authentication → Users
--
-- insert into platform_admins (user_id) values ('YOUR-USER-UUID-HERE')
-- on conflict (user_id) do nothing;
