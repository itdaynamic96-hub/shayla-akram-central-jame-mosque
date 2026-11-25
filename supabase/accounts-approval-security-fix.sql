-- Security hardening for the Accounts approval RPC.
-- Prevents an authenticated user without a matching profile from passing NULL role/institution checks.
CREATE OR REPLACE FUNCTION public.account_decide_request(p_request uuid, p_decision text, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.account_approval_requests%rowtype; reqdata jsonb; journal uuid; jno bigint; line jsonb; a public.account_bank_accounts%rowtype; b public.account_bank_accounts%rowtype; profile_role text; profile_inst text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 select * into r from public.account_approval_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'Request not found or already decided'; end if;
 select role,institution into profile_role,profile_inst from public.profiles where id=auth.uid();
 if profile_role is null or profile_inst is null then raise exception 'Approver profile not found'; end if;
 if r.created_by=auth.uid() then raise exception 'A requester cannot approve their own request'; end if;
 if profile_role='custom_admin' then
  if not exists(select 1 from public.admin_module_permissions p where p.user_id=auth.uid() and p.module_key='m50' and p.can_view and p.can_write and p.can_approve) then raise exception 'Approval permission required'; end if;
 elsif profile_role not in ('super_admin','accounts_manager','mosque_admin','foundation_admin') then raise exception 'Approver role required'; end if;
 if profile_inst not in ('both',r.institution) then raise exception 'Institution mismatch'; end if;
 if (profile_role='mosque_admin' and r.institution<>'mosque') or (profile_role='foundation_admin' and r.institution<>'foundation') then raise exception 'Institution mismatch'; end if;
 if p_decision='rejected' then update public.account_approval_requests set status='rejected',approved_by=auth.uid(),approved_at=now(),decision_note=coalesce(p_note,'') where id=r.id; return null; end if;
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
end;$function$
;
