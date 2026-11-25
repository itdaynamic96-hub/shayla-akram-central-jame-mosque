-- Editorial references and media attribution for the public content library.
alter table public.site_content add column if not exists source_url text;
alter table public.site_content add column if not exists media_credit text;
-- Public display assets; only website approvers can upload/manage files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-media','site-media',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists "site media public read" on storage.objects;
drop policy if exists "site media admins list" on storage.objects;
create policy "site media admins list" on storage.objects for select to authenticated
using(bucket_id='site-media' and public.has_access(array['super_admin','admin','website_admin'],null));
drop policy if exists "site media approvers upload" on storage.objects;
create policy "site media approvers upload" on storage.objects for insert to authenticated
with check(bucket_id='site-media' and owner_id=auth.uid()::text and public.has_access(array['super_admin','admin','website_admin'],null));
drop policy if exists "site media approvers update" on storage.objects;
create policy "site media approvers update" on storage.objects for update to authenticated
using(bucket_id='site-media' and public.has_access(array['super_admin','admin','website_admin'],null))
with check(bucket_id='site-media' and public.has_access(array['super_admin','admin','website_admin'],null));
drop policy if exists "site media approvers delete" on storage.objects;
create policy "site media approvers delete" on storage.objects for delete to authenticated
using(bucket_id='site-media' and public.has_access(array['super_admin','admin','website_admin'],null));


-- Role expansion and structured CRUD for the 60 administration modules.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
 'pending','super_admin','mosque_admin','foundation_admin','accountant','manager','editor','auditor','viewer',
 'admin','accounts_manager','website_admin'
));
create table if not exists public.module_records(
 id uuid primary key default gen_random_uuid(),
 module_key text not null check(module_key ~ '^m(0[1-9]|[1-5][0-9]|6[01])$'),
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
   or (target_key='m61' and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution='mosque')
   or (target_key='m61' and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution='mosque')
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
  (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin')) or
  (target_key='m61' and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque') and target_institution='mosque')));
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
create policy "module records insert by role" on public.module_records for insert to authenticated with check(public.module_record_access(module_key,institution,true) and created_by=(select auth.uid()) and status in ('draft','pending'));
drop policy if exists "module records update by role" on public.module_records;
create policy "module records update by role" on public.module_records for update to authenticated using(public.module_record_access(module_key,institution,true)) with check(public.module_record_access(module_key,institution,true) and (status not in ('approved','published') or public.module_record_approval_access(module_key,institution)));
drop policy if exists "module records delete by super admin" on public.module_records;
create policy "module records delete by super admin" on public.module_records for delete to authenticated using(public.has_access(array['super_admin'],null));
grant select,insert,update,delete on public.module_records to authenticated;

-- Website editor and public notice policies.
drop policy if exists "public can read published announcements" on public.announcements;
create policy "public can read published announcements" on public.announcements for select to anon,authenticated using(status='published');
grant select on public.announcements to anon,authenticated;

drop policy if exists "admins create announcements" on public.announcements;
create policy "admins create announcements" on public.announcements for insert to authenticated
with check (created_by=(select auth.uid()) and public.has_access(array['super_admin','admin','website_admin','editor'],null));
drop policy if exists "admins update announcements" on public.announcements;
create policy "admins update announcements" on public.announcements for update to authenticated
using (public.has_access(array['super_admin','admin','website_admin','editor'],null))
with check (public.has_access(array['super_admin','admin','website_admin','editor'],null));
drop policy if exists "website admins manage site content" on public.site_content;
create policy "website admins manage site content" on public.site_content for all to authenticated
using(public.has_access(array['super_admin','admin','website_admin','editor'],null))
with check(public.has_access(array['super_admin','admin','website_admin','editor'],null));
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
drop policy if exists "accounts read institution receipts" on storage.objects;
create policy "accounts read institution receipts" on storage.objects for select to authenticated
using(bucket_id='private-receipts' and public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],split_part(name,'/',1)));
create or replace function public.receipt_is_unlinked(target_path text)
returns boolean language sql stable security definer set search_path=public
as $receipt$
 select not exists(select 1 from public.ledger_entries where receipt_path=target_path);
$receipt$;
revoke all on function public.receipt_is_unlinked(text) from public;
grant execute on function public.receipt_is_unlinked(text) to authenticated;
drop policy if exists "accounts delete unlinked own receipts" on storage.objects;
create policy "accounts delete unlinked own receipts" on storage.objects for delete to authenticated
using(bucket_id='private-receipts' and owner_id=auth.uid()::text
 and public.has_access(array['super_admin','accounts_manager','accountant'],split_part(name,'/',1))
 and public.receipt_is_unlinked(name));

-- Explicit SQL table privileges; RLS below remains the row-level security boundary.
grant select,insert,update on public.ledger_entries to authenticated;
grant select,insert,update on public.budgets to authenticated;

-- Department administrators may review their own institution's accounts and budgets.
drop policy if exists "managers approve and edit" on public.ledger_entries;
create policy "managers approve and edit" on public.ledger_entries for update to authenticated
using (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution))
with check (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution));
drop policy if exists "accounts managers manage budgets" on public.budgets;
drop policy if exists "accounts managers insert budgets" on public.budgets;
create policy "accounts managers insert budgets" on public.budgets for insert to authenticated
with check(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) and created_by=auth.uid());
drop policy if exists "accounts managers update budgets" on public.budgets;
create policy "accounts managers update budgets" on public.budgets for update to authenticated
using(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check(public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));

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

alter table public.module_records drop constraint if exists module_records_m61_mosque_only_check;
alter table public.module_records add constraint module_records_m61_mosque_only_check check (module_key <> 'm61' or institution='mosque');
revoke all on function public.guard_module_record_publication() from public,anon,authenticated;
revoke all on function public.log_module_record_change() from public,anon,authenticated;
create index if not exists module_records_approved_by_idx on public.module_records(approved_by);
create index if not exists module_records_created_by_idx on public.module_records(created_by);

alter table public.module_records drop constraint if exists module_records_mosque_basic_module_key_check;
