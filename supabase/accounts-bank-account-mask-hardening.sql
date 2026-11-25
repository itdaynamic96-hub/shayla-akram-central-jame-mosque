create or replace function public.account_create_bank_account(
  p_institution text,
  p_name text,
  p_bank text,
  p_number text,
  p_kind text,
  p_opening numeric
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  code text;
  result_id uuid;
  journal uuid;
  jno bigint;
  digits text;
  masked_number text;
begin
  if auth.uid() is null or not public.accounts_feature_access(p_institution,'m46',true) then
    raise exception 'Not authorized';
  end if;
  if p_name is null or trim(p_name)='' or p_kind is null
     or p_kind not in ('cash','bank','mobile_banking')
     or p_opening is null or p_opening<0 then
    raise exception 'Invalid account name, type or opening balance';
  end if;
  digits:=regexp_replace(coalesce(p_number,''),'\D','','g');
  masked_number:=case when digits='' then '' else '••••'||right(digits,4) end;
  perform pg_advisory_xact_lock(hashtext('account_bank_code_'||p_institution));
  select (coalesce(max(account_code::integer),1099)+1)::text into code
    from public.account_chart_of_accounts
   where institution=p_institution and account_code ~ '^[0-9]+$' and account_code::integer>=1100;
  insert into public.account_chart_of_accounts(institution,account_code,account_name,account_type,is_system,is_active)
  values(p_institution,code,p_name,'asset',false,true);
  insert into public.account_bank_accounts(institution,account_name,institution_name,account_number_masked,account_kind,payment_provider,account_code,opening_balance,created_by)
  values(p_institution,p_name,coalesce(p_bank,''),masked_number,p_kind,coalesce(p_bank,''),code,p_opening,auth.uid())
  returning id into result_id;
  if p_opening>0 then
    perform pg_advisory_xact_lock(hashtext('account_journal_no_'||p_institution));
    select coalesce(max(journal_no),0)+1 into jno from public.account_journal_entries where institution=p_institution;
    insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
    values(p_institution,jno,current_date,'Opening balance: '||p_name,'adjustment',result_id,'posted',auth.uid())
    returning id into journal;
    insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
    values(journal,p_institution,code,'Opening balance',p_opening,0),(journal,p_institution,'3000','Opening balance equity',0,p_opening);
  end if;
  return result_id;
end;
$$;
revoke all on function public.account_create_bank_account(text,text,text,text,text,numeric) from public,anon;
grant execute on function public.account_create_bank_account(text,text,text,text,text,numeric) to authenticated;
