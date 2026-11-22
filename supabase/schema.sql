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
-- SQL privileges are separate from RLS policies; grant only the operations covered by the policies.
grant select, update on public.profiles to authenticated;
drop policy if exists "accounts staff read own institution" on public.ledger_entries;
create policy "accounts staff read own institution" on public.ledger_entries for select to authenticated
using (public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'], institution));
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
using (public.has_access(array['super_admin','admin','website_admin','editor'], null));
drop policy if exists "public can read published announcements" on public.announcements;
create policy "public can read published announcements" on public.announcements for select to anon,authenticated using(status='published');
grant select on public.announcements to anon,authenticated;
drop policy if exists "admins create announcements" on public.announcements;
create policy "admins create announcements" on public.announcements for insert to authenticated
with check (created_by = auth.uid() and public.has_access(array['super_admin','admin','website_admin','editor'], null));
drop policy if exists "admins update announcements" on public.announcements;
create policy "admins update announcements" on public.announcements for update to authenticated
using (public.has_access(array['super_admin','admin','website_admin','editor'], null))
with check (public.has_access(array['super_admin','admin','website_admin','editor'], null));
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
create policy "public can read published site content" on public.site_content for select to anon,authenticated using(status='published' or public.has_access(array['super_admin','admin','website_admin','editor'],null));
drop policy if exists "website admins manage site content" on public.site_content;
create policy "website admins manage site content" on public.site_content for all to authenticated using(public.has_access(array['super_admin','admin','website_admin','editor'],null)) with check(public.has_access(array['super_admin','admin','website_admin','editor'],null));
grant select on public.site_content to anon,authenticated;
grant insert,update,delete on public.site_content to authenticated;
create or replace function public.guard_public_content_publish()
returns trigger language plpgsql set search_path=public
as $guard$
begin
 if tg_op='DELETE' then
   if old.status='published' and not public.has_access(array['super_admin','admin','website_admin'],null) then
     raise exception 'Only an authorized website approver may remove published content.';
   end if;
   return old;
 end if;
 if tg_op='UPDATE' and old.status='published' and new.status<>'published'
    and not public.has_access(array['super_admin','admin','website_admin'],null) then
   raise exception 'Only an authorized website approver may unpublish content.';
 end if;
 if new.status='published' then
   if tg_op='INSERT' then
     if not public.has_access(array['super_admin','admin','website_admin'],null) then
       raise exception 'Only an authorized website approver may publish content.';
     end if;
   elsif (to_jsonb(new)-'updated_at'-'created_at') is distinct from (to_jsonb(old)-'updated_at'-'created_at') then
     if not public.has_access(array['super_admin','admin','website_admin'],null) then
       raise exception 'Only an authorized website approver may publish content.';
     end if;
   end if;
 end if;
 return new;
end;
$guard$;
drop trigger if exists announcements_publish_guard on public.announcements;
create trigger announcements_publish_guard before insert or update on public.announcements
for each row execute function public.guard_public_content_publish();
drop trigger if exists site_content_publish_guard on public.site_content;
create trigger site_content_publish_guard before insert or update or delete on public.site_content
for each row execute function public.guard_public_content_publish();


-- Accounts extensions: designated funds, budgets and private receipt attachments.
alter table public.ledger_entries add column if not exists fund_category text not null default 'general' check(fund_category in ('general','zakat','sadaqah','orphan','poor_relief','medical','education','construction'));
alter table public.ledger_entries add column if not exists receipt_path text;
create table if not exists public.budgets(
 id uuid primary key default gen_random_uuid(),
 institution text not null check(institution in ('mosque','foundation')),
 budget_month text not null check (budget_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 category text not null check(length(trim(category))>0),
 planned_amount numeric(14,2) not null check(planned_amount>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(institution,budget_month,category)
);
alter table public.budgets enable row level security;
drop policy if exists "accounts read budgets by institution" on public.budgets;
create policy "accounts read budgets by institution" on public.budgets for select to authenticated using(public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],institution));
drop policy if exists "accounts managers manage budgets" on public.budgets;
drop policy if exists "accounts managers insert budgets" on public.budgets;
create policy "accounts managers insert budgets" on public.budgets for insert to authenticated
with check(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) and created_by=auth.uid());
drop policy if exists "accounts managers update budgets" on public.budgets;
create policy "accounts managers update budgets" on public.budgets for update to authenticated
using(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));
grant select,insert,update on public.budgets to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('private-receipts','private-receipts',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists "accounts upload own institution receipts" on storage.objects;
create policy "accounts upload own institution receipts" on storage.objects for insert to authenticated with check(bucket_id='private-receipts' and public.has_access(array['super_admin','accounts_manager','accountant'],split_part(name,'/',1)));
drop policy if exists "accounts read institution receipts" on storage.objects;
create policy "accounts read institution receipts" on storage.objects for select to authenticated using(bucket_id='private-receipts' and public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],split_part(name,'/',1)));
-- Preserve the audit trail: posted ledger rows cannot be deleted or silently edited.
create or replace function public.protect_ledger_history() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'Ledger entries cannot be deleted; use a correcting entry.'; end if;
 if old.status in ('approved','rejected') then raise exception 'Finalized ledger entries are immutable; create a correcting entry.'; end if;
 if new.institution<>old.institution or new.created_by<>old.created_by then raise exception 'Institution and creator cannot be changed.'; end if;
 if new.status not in ('pending','approved','rejected') then raise exception 'Invalid ledger status.'; end if;
 if new.status in ('approved','rejected') then
   if new.entry_type<>old.entry_type or new.entry_date<>old.entry_date or new.category<>old.category or new.amount<>old.amount or new.payer_or_payee<>old.payer_or_payee or new.payment_method<>old.payment_method or new.reference_no<>old.reference_no or new.note<>old.note or new.fund_category<>old.fund_category or new.receipt_path is distinct from old.receipt_path then
     raise exception 'Review and approve the original entry without changing its financial details.';
   end if;
   if new.approved_by is distinct from auth.uid() or new.approved_at is null then raise exception 'Approval identity and time are required.'; end if;
 end if;
 return new;
end;$$;
drop trigger if exists protect_ledger_history_trigger on public.ledger_entries;
create trigger protect_ledger_history_trigger before update or delete on public.ledger_entries for each row execute function public.protect_ledger_history();
revoke delete on public.ledger_entries from authenticated;


-- Explicit SQL privileges required by the Admin Panel (RLS policies above still enforce roles).
grant select, insert, update on public.announcements to authenticated;
grant select on public.audit_logs to authenticated;
grant select, update on public.profiles to authenticated;


-- Role expansion and structured CRUD for the 60 administration modules.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
 'pending','super_admin','mosque_admin','foundation_admin','accountant','manager','editor','auditor','viewer',
 'admin','accounts_manager','website_admin'
));
create table if not exists public.module_records(
 id uuid primary key default gen_random_uuid(),
 module_key text not null check(module_key ~ '^m(0[1-9]|[1-5][0-9]|60)$'),
 institution text not null check(institution in ('mosque','foundation','both')),
 title text not null check(length(trim(title)) between 1 and 180),
 data jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check(status in ('draft','pending','approved','published','archived','rejected')),
 created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists module_records_key_updated_idx on public.module_records(module_key,updated_at desc);
create index if not exists module_records_institution_idx on public.module_records(institution,status);
alter table public.module_records enable row level security;
create or replace function public.module_record_access(target_key text,target_institution text,write_access boolean default false)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.profiles p
 where p.id=auth.uid() and (
   p.role='super_admin'
   or (not write_access and p.role in ('auditor','viewer') and (p.institution='both' or target_institution='both' or p.institution=target_institution))
   or (substring(target_key from 2)::integer between 1 and 6 and p.role='admin')
   or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin','editor'))
   or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin','manager') and (p.institution in ('both','mosque')) and target_institution='mosque')
   or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin','manager') and (p.institution in ('both','foundation')) and target_institution='foundation')
   or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager','accountant') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
   or (substring(target_key from 2)::integer between 51 and 60 and p.role='admin')
 ) and (not write_access or p.role not in ('auditor','viewer')));
$$;
create or replace function public.module_record_approval_access(target_key text,target_institution text)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and
 (p.role='super_admin' or
  (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque')) or
  (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin') and p.institution in ('both','foundation')) or
  (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution)) or
  (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin'))));
$$;
create or replace function public.guard_module_record_publication()
returns trigger language plpgsql security definer set search_path=public
as $guard$
begin
 if new.status in ('approved','published') then
   if not public.module_record_approval_access(new.module_key,new.institution) then
     raise exception 'Only an authorized approver may approve or publish this record.';
   end if;
   if new.approved_by is distinct from auth.uid() or new.approved_at is null then
     raise exception 'Approval identity and timestamp are required.';
   end if;
 end if;
 return new;
end;
$guard$;
drop trigger if exists module_record_publication_guard on public.module_records;
create trigger module_record_publication_guard before insert or update on public.module_records
for each row execute function public.guard_module_record_publication();
drop policy if exists "module records read by role" on public.module_records;
create policy "module records read by role" on public.module_records for select to authenticated using(public.module_record_access(module_key,institution,false));
drop policy if exists "module records insert by role" on public.module_records;
create policy "module records insert by role" on public.module_records for insert to authenticated with check(public.module_record_access(module_key,institution,true) and created_by=auth.uid() and status in ('draft','pending'));
drop policy if exists "module records update by role" on public.module_records;
create policy "module records update by role" on public.module_records for update to authenticated using(public.module_record_access(module_key,institution,true)) with check(public.module_record_access(module_key,institution,true) and (status not in ('approved','published') or public.module_record_approval_access(module_key,institution)));
drop policy if exists "module records delete by super admin" on public.module_records;
create policy "module records delete by super admin" on public.module_records for delete to authenticated using(public.has_access(array['super_admin'],null));
grant select,insert,update,delete on public.module_records to authenticated;

-- Department administrators may review their own institution's accounts and budgets.
drop policy if exists "managers approve and edit" on public.ledger_entries;
create policy "managers approve and edit" on public.ledger_entries for update to authenticated
using (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution))
with check (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution));
drop policy if exists "accounts managers manage budgets" on public.budgets;
create policy "accounts managers manage budgets" on public.budgets for all to authenticated
using (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) and created_by=auth.uid());

create or replace function public.log_module_record_change()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.audit_logs(actor,table_name,record_id,action,before_data,after_data)
 values(auth.uid(),'module_records',coalesce(new.id,old.id)::text,tg_op,
 case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
 case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
drop trigger if exists module_records_audit_trigger on public.module_records;
create trigger module_records_audit_trigger after insert or update or delete on public.module_records
for each row execute function public.log_module_record_change();
