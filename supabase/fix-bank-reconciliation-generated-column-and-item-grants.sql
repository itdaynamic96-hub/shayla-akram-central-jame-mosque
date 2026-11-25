create or replace function public.account_create_bank_reconciliation(
 p_institution text,p_bank_account uuid,p_statement_date date,
 p_statement_opening numeric,p_statement_closing numeric,p_notes text default ''
)
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $function$
declare bank public.account_bank_accounts%rowtype; book numeric; result_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_statement_date is null or p_statement_opening is null or p_statement_closing is null then raise exception 'Statement date and balances are required'; end if;
 if p_statement_opening<0 or p_statement_closing<0 then raise exception 'Statement balances cannot be negative'; end if;
 if not public.accounts_feature_access(p_institution,'m46',true) then raise exception 'Not authorized'; end if;
 select * into bank from public.account_bank_accounts where id=p_bank_account and institution=p_institution and is_active for update;
 if not found then raise exception 'Active bank/cash account not found for this institution'; end if;
 if exists(select 1 from public.account_bank_reconciliations r where r.bank_account_id=p_bank_account and r.statement_date=p_statement_date) then raise exception 'A reconciliation already exists for this account and statement date'; end if;
 select coalesce(sum(l.debit-l.credit),0) into book from public.account_journal_lines l join public.account_journal_entries j on j.id=l.journal_id
 where l.institution=p_institution and l.account_code=bank.account_code and j.institution=p_institution and j.status='posted' and j.journal_date<=p_statement_date;
 book:=round(book,2);
 insert into public.account_bank_reconciliations(institution,bank_account_id,statement_date,statement_opening,statement_closing,book_balance,status,notes,created_by)
 values(p_institution,p_bank_account,p_statement_date,p_statement_opening,p_statement_closing,book,'draft',coalesce(p_notes,''),auth.uid())
 returning id into result_id;
 return result_id;
end;
$function$;
revoke execute on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) to authenticated;
grant insert,delete on table public.account_bank_reconciliation_items to authenticated;
revoke all on function public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid) from public,anon,authenticated;
