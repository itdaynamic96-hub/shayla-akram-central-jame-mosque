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
   or (not write_access and p.role in ('auditor','viewer') and (p.institution='both' or p.institution=target_institution))
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
drop policy if exists "module records read by role" on public.module_records;
create policy "module records read by role" on public.module_records for select to authenticated using(public.module_record_access(module_key,institution,false));
drop policy if exists "module records insert by role" on public.module_records;
create policy "module records insert by role" on public.module_records for insert to authenticated with check(public.module_record_access(module_key,institution,true) and created_by=auth.uid() and status<>'approved');
drop policy if exists "module records update by role" on public.module_records;
create policy "module records update by role" on public.module_records for update to authenticated using(public.module_record_access(module_key,institution,true)) with check(public.module_record_access(module_key,institution,true) and (status<>'approved' or public.module_record_approval_access(module_key,institution)));
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
