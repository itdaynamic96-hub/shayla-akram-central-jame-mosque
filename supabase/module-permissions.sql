-- Granular module permissions and Super Admin-managed Auth accounts.
-- Safe to re-run. Run after schema.sql and admin-modules.sql.
alter table public.profiles add column if not exists email text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
 'pending','super_admin','mosque_admin','foundation_admin','accountant','manager','editor','auditor','viewer',
 'admin','accounts_manager','website_admin','custom_admin'
));

create table if not exists public.admin_module_permissions (
 user_id uuid not null references auth.users(id) on delete cascade,
 module_key text not null check(module_key ~ '^m(0[1-9]|[1-5][0-9]|60)$'),
 can_view boolean not null default true,
 can_write boolean not null default false,
 can_approve boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,module_key),
 constraint module_permission_dependencies check ((not can_write or can_view) and (not can_approve or (can_view and can_write)))
);
alter table public.admin_module_permissions enable row level security;
drop policy if exists "users read own module permissions" on public.admin_module_permissions;
create policy "users read own module permissions" on public.admin_module_permissions
 for select to authenticated using(user_id=auth.uid() or public.has_access(array['super_admin'],null));
drop policy if exists "super admins manage module permissions" on public.admin_module_permissions;
create policy "super admins manage module permissions" on public.admin_module_permissions
 for all to authenticated using(public.has_access(array['super_admin'],null))
 with check(public.has_access(array['super_admin'],null));
grant select,insert,update,delete on public.admin_module_permissions to authenticated;

create or replace function public.module_record_access(target_key text,target_institution text,write_access boolean default false)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
    and (
      p.role='super_admin'
      or (
        p.role='custom_admin'
        and (p.institution='both' or p.institution=target_institution)
        and exists(
          select 1 from public.admin_module_permissions mp
          where mp.user_id=p.id and mp.module_key=target_key
            and mp.can_view
            and (not write_access or mp.can_write)
        )
      )
      or (substring(target_key from 2)::integer between 1 and 6 and p.role='admin')
      or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin','editor'))
      or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution='mosque')
      or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin','manager') and p.institution in ('both','foundation') and target_institution='foundation')
      or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager','accountant') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
      or (substring(target_key from 2)::integer between 51 and 60 and p.role='admin')
    )
    and (not write_access or p.role not in ('auditor','viewer'))
 );
$$;

create or replace function public.module_record_approval_access(target_key text,target_institution text)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
   and (
    p.role='super_admin'
    or (
      p.role='custom_admin'
      and (p.institution='both' or p.institution=target_institution)
      and exists(select 1 from public.admin_module_permissions mp
        where mp.user_id=p.id and mp.module_key=target_key and mp.can_view and mp.can_write and mp.can_approve)
    )
    or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque'))
    or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin') and p.institution in ('both','foundation'))
    or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution))
    or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin'))
   )
 );
$$;
revoke all on function public.module_record_access(text,text,boolean) from public;
revoke all on function public.module_record_approval_access(text,text) from public;
grant execute on function public.module_record_access(text,text,boolean) to authenticated;
grant execute on function public.module_record_approval_access(text,text) to authenticated;

-- Atomically replace permissions from the trusted Edge Function only.
create or replace function public.replace_admin_module_permissions(target_user uuid, permission_rows jsonb)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if auth.role() <> 'service_role' then
   raise exception 'Only the trusted server function may replace module permissions.';
 end if;
 if jsonb_typeof(permission_rows) <> 'array' or jsonb_array_length(permission_rows) > 60 then
   raise exception 'Invalid module permission list.';
 end if;
 delete from public.admin_module_permissions where user_id=target_user;
 insert into public.admin_module_permissions(user_id,module_key,can_view,can_write,can_approve)
 select target_user, x->>'module_key',
        coalesce((x->>'can_view')::boolean,true),
        coalesce((x->>'can_write')::boolean,false),
        coalesce((x->>'can_approve')::boolean,false)
 from jsonb_array_elements(permission_rows) as item(value);
end;
$$;
revoke all on function public.replace_admin_module_permissions(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_admin_module_permissions(uuid,jsonb) to service_role;

-- Map the Accounts modules (m41-m50) to the real ledger, budget and receipt tables.
create or replace function public.account_module_permission(
 target_institution text, target_modules text[], write_access boolean default false, approve_access boolean default false
) returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.profiles p
  join public.admin_module_permissions mp on mp.user_id=p.id
  where p.id=auth.uid() and p.role='custom_admin'
    and (p.institution='both' or p.institution=target_institution)
    and mp.module_key=any(target_modules) and mp.can_view
    and (not write_access or mp.can_write)
    and (not approve_access or mp.can_approve)
 );
$$;
revoke all on function public.account_module_permission(text,text[],boolean,boolean) from public;
grant execute on function public.account_module_permission(text,text[],boolean,boolean) to authenticated;

drop policy if exists "accounts staff read own institution" on public.ledger_entries;
create policy "accounts staff read own institution" on public.ledger_entries for select to authenticated
using (
 public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],institution)
 or public.account_module_permission(institution,array['m41','m42','m43','m44','m45','m46','m47','m48','m49','m50'])
);
drop policy if exists "accounts staff create pending" on public.ledger_entries;
create policy "accounts staff create pending" on public.ledger_entries for insert to authenticated
with check (
 status='pending' and created_by=auth.uid() and (
  public.has_access(array['super_admin','accounts_manager','accountant'],institution)
  or (entry_type='income' and (
    (fund_category in ('zakat','sadaqah') and public.account_module_permission(institution,array['m45'],true))
    or (fund_category='general' and public.account_module_permission(institution,array['m44'],true))
    or public.account_module_permission(institution,array['m42'],true)
  ))
  or (entry_type='expense' and public.account_module_permission(institution,array['m43','m45'],true))
 )
);
drop policy if exists "managers approve and edit" on public.ledger_entries;
create policy "managers approve and edit" on public.ledger_entries for update to authenticated
using (
 status='pending' and (
  public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
  or public.account_module_permission(institution,array['m42','m43','m44','m45','m50'],true,true)
 )
)
with check (
 public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
 or public.account_module_permission(institution,array['m42','m43','m44','m45','m50'],true,true)
);

drop policy if exists "accounts read budgets by institution" on public.budgets;
create policy "accounts read budgets by institution" on public.budgets for select to authenticated
using (
 public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],institution)
 or public.account_module_permission(institution,array['m41','m48'])
);
drop policy if exists "accounts managers insert budgets" on public.budgets;
create policy "accounts managers insert budgets" on public.budgets for insert to authenticated
with check (
 created_by=auth.uid() and (
  public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
  or public.account_module_permission(institution,array['m48'],true)
 )
);
drop policy if exists "accounts managers update budgets" on public.budgets;
create policy "accounts managers update budgets" on public.budgets for update to authenticated
using (
 public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
 or public.account_module_permission(institution,array['m48'],true)
)
with check (
 public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
 or public.account_module_permission(institution,array['m48'],true)
);

drop policy if exists "accounts upload own institution receipts" on storage.objects;
create policy "accounts upload own institution receipts" on storage.objects for insert to authenticated
with check (
 bucket_id='private-receipts' and owner_id=auth.uid()::text and (
  public.has_access(array['super_admin','accounts_manager','accountant'],split_part(name,'/',1))
  or public.account_module_permission(split_part(name,'/',1),array['m42','m43','m44','m45','m49'],true)
 )
);
drop policy if exists "accounts read institution receipts" on storage.objects;
create policy "accounts read institution receipts" on storage.objects for select to authenticated
using (
 bucket_id='private-receipts' and (
  public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],split_part(name,'/',1))
  or public.account_module_permission(split_part(name,'/',1),array['m41','m49','m50'])
 )
);
drop policy if exists "accounts delete unlinked own receipts" on storage.objects;
create policy "accounts delete unlinked own receipts" on storage.objects for delete to authenticated
using (
 bucket_id='private-receipts' and owner_id=auth.uid()::text
 and public.receipt_is_unlinked(name)
 and (
  public.has_access(array['super_admin','accounts_manager','accountant'],split_part(name,'/',1))
  or public.account_module_permission(split_part(name,'/',1),array['m49'],true)
 )
);
