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
