-- Admin Panel enhancements: corrected module forms, private Muslim registration,
-- dynamic website navigation, and role-scoped media uploads.
-- Run once in Supabase SQL Editor after the existing schema/admin-module migrations.

-- Extend module identifiers without changing or reusing existing records.
alter table public.module_records drop constraint if exists module_records_module_key_check;
alter table public.module_records add constraint module_records_module_key_check
  check (module_key ~ '^m(0[1-9]|[1-5][0-9]|60|61)$');

alter table public.admin_module_permissions drop constraint if exists admin_module_permissions_module_key_check;
alter table public.admin_module_permissions add constraint admin_module_permissions_module_key_check
  check (module_key ~ '^m(0[1-9]|[1-5][0-9]|60|61)$');

-- Add m61 (Muslim registration) to the existing permission model.
create or replace function public.module_record_access(target_key text,target_institution text,write_access boolean default false)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
   and (
    p.role='super_admin'
   or (
   not write_access and p.role='auditor' and (
     (target_key='m03' and (p.institution='both' or p.institution=target_institution))
     or (substring(target_key from 2)::integer between 11 and 20 and (p.institution='both' or p.institution=target_institution))
     or (substring(target_key from 2)::integer between 21 and 30 and p.institution in ('both','mosque') and target_institution='mosque')
     or (substring(target_key from 2)::integer between 31 and 40 and p.institution in ('both','foundation') and target_institution='foundation')
   )
 )
 or (
   not write_access and p.role='viewer' and (
     (substring(target_key from 2)::integer between 11 and 20 and (p.institution='both' or p.institution=target_institution))
     or (substring(target_key from 2)::integer between 21 and 30 and p.institution in ('both','mosque') and target_institution='mosque')
     or (substring(target_key from 2)::integer between 31 and 40 and p.institution in ('both','foundation') and target_institution='foundation')
   )
 )
    or (p.role='custom_admin'
      and (p.institution='both' or p.institution=target_institution)
      and (target_key <> 'm61' or target_institution='mosque')
      and (substring(target_key from 2)::integer not between 21 and 30 or target_institution='mosque')
      and (substring(target_key from 2)::integer not between 31 and 40 or target_institution='foundation')
      and exists(select 1 from public.admin_module_permissions mp
        where mp.user_id=p.id and mp.module_key=target_key and mp.can_view
          and (not write_access or mp.can_write)))
    or (substring(target_key from 2)::integer between 1 and 6 and p.role='admin')
    or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin','editor'))
    or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin','manager')
        and p.institution in ('both','mosque') and target_institution='mosque')
    or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin','manager')
        and p.institution in ('both','foundation') and target_institution='foundation')
    or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager','accountant')
        and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
    or (substring(target_key from 2)::integer between 51 and 60 and p.role='admin')
    or (target_key='m61' and p.role in ('admin','mosque_admin','manager')
        and p.institution in ('both','mosque') and target_institution='mosque')
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
    or (p.role='custom_admin'
      and (p.institution='both' or p.institution=target_institution)
      and (target_key <> 'm61' or target_institution='mosque')
      and (substring(target_key from 2)::integer not between 21 and 30 or target_institution='mosque')
      and (substring(target_key from 2)::integer not between 31 and 40 or target_institution='foundation')
      and exists(select 1 from public.admin_module_permissions mp
        where mp.user_id=p.id and mp.module_key=target_key and mp.can_view and mp.can_write and mp.can_approve))
    or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque'))
    or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin') and p.institution in ('both','foundation'))
    or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution))
    or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin'))
    or (target_key='m61' and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque') and target_institution='mosque')
   )
 );
$$;
revoke all on function public.module_record_access(text,text,boolean) from public;
revoke all on function public.module_record_approval_access(text,text) from public;
grant execute on function public.module_record_access(text,text,boolean) to authenticated;
grant execute on function public.module_record_approval_access(text,text) to authenticated;

-- Public media bucket: images, PDFs and short educational videos.
-- Maximum object size is 50 MB, compatible with the Supabase Free project limit.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-media','site-media',true,52428800,
 array['image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/webm','video/ogg'])
on conflict(id) do update set public=true,file_size_limit=52428800,
 allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/webm','video/ogg'];

-- Existing website approvers retain access. Module editors can upload only
-- under modules/<module_key>/<institution>/<user-id>/...
drop policy if exists "site media admins list" on storage.objects;
create policy "site media admins list" on storage.objects for select to authenticated
using (
 bucket_id='site-media' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),false))
 )
);
drop policy if exists "site media approvers upload" on storage.objects;
create policy "site media approvers upload" on storage.objects for insert to authenticated
with check (
 bucket_id='site-media' and owner_id=auth.uid()::text and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
 )
);
drop policy if exists "site media approvers update" on storage.objects;
create policy "site media approvers update" on storage.objects for update to authenticated
using (
 bucket_id='site-media' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
 )
)
with check (
 bucket_id='site-media' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
 )
);
drop policy if exists "site media approvers delete" on storage.objects;
create policy "site media approvers delete" on storage.objects for delete to authenticated
using (
 bucket_id='site-media' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
 )
);

-- Publicly visible, explicitly published website menu and SEO records.
grant select on public.module_records to anon;
drop policy if exists "public can read published public module records" on public.module_records;
create policy "public can read published public module records"
on public.module_records for select to anon,authenticated
using (
 status='published'
 and data->>'public_display'='true'
 and data ? 'public_module'
 and module_key in (
  'm07','m08','m10','m11','m12','m14','m15','m16','m17','m18','m19','m20',
  'm21','m22','m23','m24','m25','m26','m27','m28',
  'm31','m32','m33','m36','m37','m38','m40'
 )
);

-- Muslim registration records remain private; no anon SELECT policy is granted.

-- Allow the permission-management Edge Function to assign up to all 61 modules.
create or replace function public.replace_admin_module_permissions(target_user uuid, permission_rows jsonb)
returns void language plpgsql security definer set search_path=public
as $$
declare
 target_institution text;
begin
 if auth.role() <> 'service_role' then
   raise exception 'Only the trusted server function may replace module permissions.';
 end if;
 if jsonb_typeof(permission_rows) is distinct from 'array' then
   raise exception 'Invalid module permission list.';
 end if;
 if jsonb_array_length(permission_rows) > 61 then
   raise exception 'At most 61 module permissions are allowed.';
 end if;
 select institution into target_institution
 from public.profiles
 where id=target_user and role='custom_admin';
 if not found then
   raise exception 'Target user must be an existing custom_admin.';
 end if;
 if exists (
   select 1 from jsonb_array_elements(permission_rows) as item(value)
   where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value->>'module_key','') !~ '^m(0[1-9]|[1-5][0-9]|60|61)$'
      or coalesce(item.value->>'can_view','true') not in ('true','false')
      or coalesce(item.value->>'can_write','false') not in ('true','false')
      or coalesce(item.value->>'can_approve','false') not in ('true','false')
      or (coalesce(item.value->>'can_write','false')='true' and coalesce(item.value->>'can_view','true')<>'true')
      or (coalesce(item.value->>'can_approve','false')='true' and coalesce(item.value->>'can_write','false')<>'true')
      or (coalesce(item.value->>'module_key','') ~ '^m(2[1-9]|30)$' and target_institution not in ('mosque','both'))
      or (coalesce(item.value->>'module_key','') ~ '^m(3[1-9]|40)$' and target_institution not in ('foundation','both'))
      or (item.value->>'module_key'='m61' and target_institution not in ('mosque','both'))
 ) then
   raise exception 'Invalid module permission row for the target institution.';
 end if;
 if (select count(*) from jsonb_array_elements(permission_rows))
    <> (select count(distinct item.value->>'module_key') from jsonb_array_elements(permission_rows) as item(value)) then
   raise exception 'Duplicate module permission keys are not allowed.';
 end if;
 delete from public.admin_module_permissions where user_id=target_user;
 insert into public.admin_module_permissions(user_id,module_key,can_view,can_write,can_approve)
 select target_user, item.value->>'module_key',
        coalesce((item.value->>'can_view')::boolean,true),
        coalesce((item.value->>'can_write')::boolean,false),
        coalesce((item.value->>'can_approve')::boolean,false)
 from jsonb_array_elements(permission_rows) as item(value);
end;
$$;
revoke all on function public.replace_admin_module_permissions(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_admin_module_permissions(uuid,jsonb) to service_role;
