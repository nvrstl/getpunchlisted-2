-- Add role-based contact fields to projects
-- Run in Supabase SQL Editor: Dashboard → SQL Editor

alter table projects add column if not exists bouwheer_name  text;
alter table projects add column if not exists bouwheer_email text;
alter table projects add column if not exists architect_name  text;
alter table projects add column if not exists architect_email text;
alter table projects add column if not exists calculator_name  text;
alter table projects add column if not exists calculator_email text;
