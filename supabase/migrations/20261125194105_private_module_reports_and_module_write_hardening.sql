create or replace function public.module_record_access(
  target_key text,
  target_institution text,
  write_access boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'custom_admin'
          and (p.institution = 'both' or p.institution = target_institution)
          and exists (
            select 1
            from public.admin_module_permissions mp
            where mp.user_id = p.id
              and mp.module_key = target_key
              and mp.can_view
              and (not write_access or mp.can_write)
          )
        )
        or (substring(target_key from 2)::integer between 1 and 6 and p.role = 'admin')
        or (target_key = 'm04' and p.role in ('admin','website_admin','editor') and p.institution in ('both','mosque') and target_institution = 'mosque')
        or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin','editor'))
        or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution = 'mosque')
        or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin','manager') and p.institution in ('both','foundation') and target_institution = 'foundation')
        or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager','accountant') and (p.institution = 'both' or p.institution = target_institution) and target_institution in ('mosque','foundation'))
        or (target_key = 'm51' and p.role in ('admin','mosque_admin','accounts_manager','accountant') and p.institution in ('both','mosque') and target_institution = 'mosque' and (not write_access or p.role = 'admin'))
        or (substring(target_key from 2)::integer between 52 and 60 and p.role = 'admin')
        or (substring(target_key from 2)::integer between 62 and 84 and p.role in ('admin','accounts_manager','accountant','mosque_admin','foundation_admin') and (p.institution = 'both' or p.institution = target_institution) and target_institution in ('mosque','foundation'))
        or (target_key = 'm85' and p.role in ('admin','mosque_admin','accounts_manager','accountant') and p.institution in ('both','mosque') and target_institution = 'mosque')
        or (target_key = 'm61' and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution = 'mosque')
      )
      and (not write_access or p.role not in ('auditor','viewer'))
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-module-files','private-module-files',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set name=excluded.name, public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "site media admins list" on storage.objects;
create policy "site media admins list" on storage.objects for select to authenticated
using (bucket_id='site-media' and name not like 'modules/m06/%' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),false))
));

drop policy if exists "site media approvers upload" on storage.objects;
create policy "site media approvers upload" on storage.objects for insert to authenticated
with check (bucket_id='site-media' and name not like 'modules/m06/%' and owner_id=auth.uid()::text and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
));

drop policy if exists "site media approvers update" on storage.objects;
create policy "site media approvers update" on storage.objects for update to authenticated
using (bucket_id='site-media' and name not like 'modules/m06/%' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
))
with check (bucket_id='site-media' and name not like 'modules/m06/%' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
));

drop policy if exists "site media approvers delete" on storage.objects;
create policy "site media approvers delete" on storage.objects for delete to authenticated
using (bucket_id='site-media' and name not like 'modules/m06/%' and (
  public.has_access(array['super_admin','admin','website_admin'],null)
  or (name like 'modules/%' and public.module_record_access(split_part(name,'/',2),split_part(name,'/',3),true))
));

drop policy if exists "private module reports authorized read" on storage.objects;
create policy "private module reports authorized read" on storage.objects for select to authenticated
using (bucket_id='private-module-files' and name like 'modules/m06/%' and public.module_record_access('m06',split_part(name,'/',3),false));

drop policy if exists "private module reports authorized upload" on storage.objects;
create policy "private module reports authorized upload" on storage.objects for insert to authenticated
with check (bucket_id='private-module-files' and name like 'modules/m06/%' and owner_id=auth.uid()::text and public.module_record_access('m06',split_part(name,'/',3),true));

drop policy if exists "private module reports authorized update" on storage.objects;
create policy "private module reports authorized update" on storage.objects for update to authenticated
using (bucket_id='private-module-files' and name like 'modules/m06/%' and public.module_record_access('m06',split_part(name,'/',3),true))
with check (bucket_id='private-module-files' and name like 'modules/m06/%' and public.module_record_access('m06',split_part(name,'/',3),true));

drop policy if exists "private module reports authorized delete" on storage.objects;
create policy "private module reports authorized delete" on storage.objects for delete to authenticated
using (bucket_id='private-module-files' and name like 'modules/m06/%' and public.module_record_access('m06',split_part(name,'/',3),true));
