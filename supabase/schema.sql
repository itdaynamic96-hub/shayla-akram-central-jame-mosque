-- Mosque & Foundation management schema for Supabase.
-- Run this entire file in Supabase SQL Editor after creating a project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'pending' check (role in ('pending','super_admin','admin','accounts_manager','accountant','auditor','website_admin')),
  institution text not null default 'mosque' check (institution in ('mosque','foundation','both')),
  created_at timestamptz not null default now()
);

create or replace function public.has_access(allowed_roles text[], target_institution text default null)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any(allowed_roles)
      and (target_institution is null or p.institution = 'both' or p.institution = target_institution)
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  institution text not null check (institution in ('mosque','foundation')),
  entry_type text not null check (entry_type in ('income','expense')),
  entry_date date not null default current_date,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  payer_or_payee text not null default '',
  payment_method text not null default 'cash' check (payment_method in ('cash','bank','mobile_banking','other')),
  reference_no text not null default '',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_date_idx on public.ledger_entries(entry_date desc);
create index if not exists ledger_entries_institution_idx on public.ledger_entries(institution, status);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  table_name text not null,
  record_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  happened_at timestamptz not null default now()
);

create or replace function public.log_ledger_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs(actor, table_name, record_id, action, before_data, after_data)
  values (
    auth.uid(), 'ledger_entries',
    coalesce(new.id, old.id)::text,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists ledger_audit_trigger on public.ledger_entries;
create trigger ledger_audit_trigger
after insert or update or delete on public.ledger_entries
for each row execute procedure public.log_ledger_change();

alter table public.profiles enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profile self or admins read" on public.profiles;
create policy "profile self or admins read" on public.profiles for select to authenticated
using (id = auth.uid() or public.has_access(array['super_admin','admin'], null));
drop policy if exists "super admins update profiles" on public.profiles;
create policy "super admins update profiles" on public.profiles for update to authenticated
using (public.has_access(array['super_admin'], null))
with check (public.has_access(array['super_admin'], null));
drop policy if exists "accounts staff read own institution" on public.ledger_entries;
create policy "accounts staff read own institution" on public.ledger_entries for select to authenticated
using (public.has_access(array['super_admin','accounts_manager','accountant','auditor'], institution));
drop policy if exists "accounts staff create pending" on public.ledger_entries;
create policy "accounts staff create pending" on public.ledger_entries for insert to authenticated
with check (
  status = 'pending' and created_by = auth.uid()
  and public.has_access(array['super_admin','accounts_manager','accountant'], institution)
);
drop policy if exists "managers approve and edit" on public.ledger_entries;
create policy "managers approve and edit" on public.ledger_entries for update to authenticated
using (public.has_access(array['super_admin','accounts_manager'], institution))
with check (public.has_access(array['super_admin','accounts_manager'], institution));
drop policy if exists "admins read announcements" on public.announcements;
create policy "admins read announcements" on public.announcements for select to authenticated
using (public.has_access(array['super_admin','admin','website_admin'], null));
drop policy if exists "admins create announcements" on public.announcements;
create policy "admins create announcements" on public.announcements for insert to authenticated
with check (created_by = auth.uid() and public.has_access(array['super_admin','admin','website_admin'], null));
drop policy if exists "admins update announcements" on public.announcements;
create policy "admins update announcements" on public.announcements for update to authenticated
using (public.has_access(array['super_admin','admin','website_admin'], null))
with check (public.has_access(array['super_admin','admin','website_admin'], null));
drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs for select to authenticated
using (public.has_access(array['super_admin','admin','auditor'], null));

-- IMPORTANT: create the first user through Supabase Auth, then promote that exact UUID:
-- update public.profiles set role='super_admin', institution='both' where id='AUTH-USER-UUID';
-- Never expose the service_role key in browser files or GitHub.

-- Homepage content: ten slots for each of three categories.
create table if not exists public.site_content (id uuid primary key default gen_random_uuid(),category text not null check(category in ('article','gallery','video')),slot_number smallint not null check(slot_number between 1 and 10),title text not null check(length(trim(title))>0),body text not null default '',media_url text,status text not null default 'draft' check(status in ('draft','published')),created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(category,slot_number));
create index if not exists site_content_public_idx on public.site_content(category,slot_number) where status='published';
alter table public.site_content enable row level security;
drop policy if exists "public can read published site content" on public.site_content;
create policy "public can read published site content" on public.site_content for select to anon,authenticated using(status='published' or public.has_access(array['super_admin','admin','website_admin'],null));
drop policy if exists "website admins manage site content" on public.site_content;
create policy "website admins manage site content" on public.site_content for all to authenticated using(public.has_access(array['super_admin','admin','website_admin'],null)) with check(public.has_access(array['super_admin','admin','website_admin'],null));
grant select on public.site_content to anon,authenticated;
grant insert,update,delete on public.site_content to authenticated;
