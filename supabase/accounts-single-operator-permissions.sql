-- Single-operator Accounts permission model.
-- Apply after the existing Accounts schema and module-permissions migrations.
-- A checked module grants all actions within that module to the assigned custom_admin.
-- Super Admin remains the only role allowed to assign/revoke modules.

create or replace function public.account_module_permission(
 target_institution text, target_modules text[], write_access boolean default false, approve_access boolean default false
) returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
 select exists(
  select 1 from public.profiles p
  join public.admin_module_permissions mp on mp.user_id=p.id
  where p.id=auth.uid() and p.role='custom_admin'
    and (p.institution='both' or p.institution=target_institution)
    and mp.module_key=any(target_modules) and mp.can_view
 );
$$;

create or replace function public.accounts_feature_access(target_institution text,target_module text,write_access boolean default false)
returns boolean language sql stable set search_path=public,pg_temp
as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.profiles p where p.id=(select auth.uid())
   and (p.institution='both' or p.institution=target_institution)
   and (
    p.role='super_admin'
    or p.role in ('admin','accounts_manager','accountant','mosque_admin','foundation_admin')
    or (not write_access and p.role='auditor')
    or exists(select 1 from public.admin_module_permissions amp
      where amp.user_id=(select auth.uid()) and amp.module_key=target_module and amp.can_view)
   )
   and (p.role<>'mosque_admin' or target_institution='mosque')
   and (p.role<>'foundation_admin' or target_institution='foundation')
 );
$$;

create or replace function public.module_record_access(target_key text,target_institution text,write_access boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
   and (
    p.role='super_admin'
    or (p.role='custom_admin' and (p.institution='both' or p.institution=target_institution)
      and exists(select 1 from public.admin_module_permissions mp where mp.user_id=p.id and mp.module_key=target_key and mp.can_view))
    or (substring(target_key from 2)::integer between 1 and 6 and p.role='admin')
    or (target_key='m04' and p.role in ('admin','website_admin','editor') and p.institution in ('both','mosque') and target_institution='mosque')
    or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin','editor'))
    or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution='mosque')
    or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin','manager') and p.institution in ('both','foundation') and target_institution='foundation')
    or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager','accountant') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
    or (target_key='m51' and p.role in ('admin','mosque_admin','accounts_manager','accountant') and p.institution in ('both','mosque') and target_institution='mosque' and (not write_access or p.role='admin'))
    or (substring(target_key from 2)::integer between 52 and 60 and p.role='admin')
    or (substring(target_key from 2)::integer between 62 and 84 and p.role in ('admin','accounts_manager','accountant','mosque_admin','foundation_admin') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
    or (target_key='m85' and p.role in ('admin','mosque_admin','accounts_manager','accountant') and p.institution in ('both','mosque') and target_institution='mosque')
    or (target_key='m61' and p.role in ('admin','mosque_admin','manager') and p.institution in ('both','mosque') and target_institution='mosque')
   )
   and (not write_access or p.role not in ('auditor','viewer'))
 );
$$;

create or replace function public.module_record_approval_access(target_key text,target_institution text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
   and (
    p.role='super_admin'
    or (p.role='custom_admin' and (p.institution='both' or p.institution=target_institution)
      and exists(select 1 from public.admin_module_permissions mp where mp.user_id=p.id and mp.module_key=target_key and mp.can_view))
    or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque'))
    or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin') and p.institution in ('both','foundation'))
    or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution))
    or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin'))
    or (target_key='m51' and p.role='admin' and p.institution in ('both','mosque') and target_institution='mosque')
    or (substring(target_key from 2)::integer between 62 and 84 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
    or (target_key='m85' and p.role in ('admin','mosque_admin','accounts_manager') and p.institution in ('both','mosque') and target_institution='mosque')
    or (target_key='m61' and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque') and target_institution='mosque')
   )
 );
$$;

-- The trusted Admin Edge Function may send module_key-only rows. Normalize each
-- selected module to all capabilities; unchecked modules are not inserted.
create or replace function public.replace_admin_module_permissions(target_user uuid,permission_rows jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
begin
 if auth.role() <> 'service_role' then raise exception 'Only the trusted server function may replace module permissions.'; end if;
 if jsonb_typeof(permission_rows) <> 'array' or jsonb_array_length(permission_rows) > 60 then raise exception 'Invalid module permission list.'; end if;
 delete from public.admin_module_permissions where user_id=target_user;
 insert into public.admin_module_permissions(user_id,module_key,can_view,can_write,can_approve)
 select target_user,item.value->>'module_key',true,true,true
 from jsonb_array_elements(permission_rows) as item(value)
 where coalesce((item.value->>'can_view')::boolean,true);
end;
$$;

-- A single assigned operator may approve their own pending financial entry.
drop policy if exists accounts_detail_approve on public.ledger_entries;
create policy accounts_detail_approve on public.ledger_entries for update to authenticated
using (status='pending' and public.account_module_permission(institution,array['m63','m64','m65','m70','m80'],true,true))
with check (status in ('approved','rejected') and approved_by=(select auth.uid()));

create or replace function public.account_decide_request(p_request uuid,p_decision text,p_note text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.account_approval_requests%rowtype; reqdata jsonb; journal uuid; jno bigint; line jsonb; a public.account_bank_accounts%rowtype; b public.account_bank_accounts%rowtype; profile_role text; profile_inst text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 select * into r from public.account_approval_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'Request not found or already decided'; end if;
 select role,institution into profile_role,profile_inst from public.profiles where id=auth.uid();
 if profile_role is null or profile_inst is null then raise exception 'Approver profile not found'; end if;
 if profile_role='custom_admin' then
  if not exists(select 1 from public.admin_module_permissions p where p.user_id=auth.uid() and p.module_key='m80' and p.can_view) then raise exception 'Approval module permission required'; end if;
 elsif profile_role not in ('super_admin','accounts_manager','mosque_admin','foundation_admin') then raise exception 'Approver role required'; end if;
 if profile_inst not in ('both',r.institution) then raise exception 'Institution mismatch'; end if;
 if (profile_role='mosque_admin' and r.institution<>'mosque') or (profile_role='foundation_admin' and r.institution<>'foundation') then raise exception 'Institution mismatch'; end if;
 if p_decision='rejected' then
  update public.account_approval_requests set status='rejected',approved_by=auth.uid(),approved_at=now(),decision_note=coalesce(p_note,'') where id=r.id; return null;
 end if;
 reqdata:=r.request_data;
 perform pg_advisory_xact_lock(hashtext('account_journal_no_'||r.institution));
 select coalesce(max(journal_no),0)+1 into jno from public.account_journal_entries where institution=r.institution;
 if r.request_type='manual_journal' then
  insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
  values(r.institution,jno,(reqdata->>'journal_date')::date,reqdata->>'description','manual',r.id,'posted',r.created_by) returning id into journal;
  for line in select * from jsonb_array_elements(reqdata->'lines') loop
   insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
   values(journal,r.institution,line->>'account_code',coalesce(line->>'description',''),coalesce((line->>'debit')::numeric,0),coalesce((line->>'credit')::numeric,0));
  end loop;
 elsif r.request_type='bank_transfer' then
  select * into a from public.account_bank_accounts where id=(reqdata->>'from_id')::uuid and institution=r.institution and is_active;
  select * into b from public.account_bank_accounts where id=(reqdata->>'to_id')::uuid and institution=r.institution and is_active;
  if a.id is null or b.id is null then raise exception 'Transfer account is inactive or missing'; end if;
  insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
  values(r.institution,jno,(reqdata->>'transfer_date')::date,coalesce(reqdata->>'description','Account transfer'),'transfer',r.id,'posted',r.created_by) returning id into journal;
  insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
  values(journal,r.institution,b.account_code,'Transfer received',(reqdata->>'amount')::numeric,0),(journal,r.institution,a.account_code,'Transfer sent',0,(reqdata->>'amount')::numeric);
 else raise exception 'Unsupported request type'; end if;
 update public.account_approval_requests set status='approved',approved_by=auth.uid(),approved_at=now(),decision_note=coalesce(p_note,''),journal_id=journal where id=r.id;
 return journal;
end;
$$;
