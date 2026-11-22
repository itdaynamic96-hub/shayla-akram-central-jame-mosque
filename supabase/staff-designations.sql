-- Add a separate organizational designation for staff accounts.
-- Run once in Supabase SQL Editor after deployment of the matching Edge Function.
alter table public.profiles
  add column if not exists job_title text not null default '';
