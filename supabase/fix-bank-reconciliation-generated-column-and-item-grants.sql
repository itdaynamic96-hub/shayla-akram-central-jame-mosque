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
revoke insert,update on public.account_bank_reconciliation_items from authenticated;
grant select,delete on table public.account_bank_reconciliation_items to authenticated;
revoke all on function public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid) to authenticated;

create or replace function public.account_add_reconciliation_item(p_reconciliation uuid,p_date date,p_description text,p_reference text,p_amount numeric,p_direction text,p_journal_line uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.account_bank_reconciliations%rowtype; a public.account_bank_accounts%rowtype; l public.account_journal_lines%rowtype; j public.account_journal_entries%rowtype; iid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.account_bank_reconciliations where id=p_reconciliation and status='draft';
 if not found or not public.accounts_feature_access(r.institution,'m46',true) then raise exception 'Draft reconciliation not found or not authorized'; end if;
 select * into a from public.account_bank_accounts where id=r.bank_account_id;
 if p_amount<=0 or p_direction not in ('deposit','withdrawal') then raise exception 'Invalid statement line'; end if;
 if p_journal_line is null then raise exception 'Select a matching posted journal line'; end if;
 select * into l from public.account_journal_lines where id=p_journal_line and institution=r.institution;
 select * into j from public.account_journal_entries where id=l.journal_id and status='posted';
 if l.id is null or j.id is null or l.account_code<>a.account_code or j.journal_date<>p_date then raise exception 'Selected journal line does not belong to this account/date'; end if;
 if p_direction='deposit' and (l.debit<>p_amount or l.credit<>0) then raise exception 'Deposit must match the debit amount on the bank account'; end if;
 if p_direction='withdrawal' and (l.credit<>p_amount or l.debit<>0) then raise exception 'Withdrawal must match the credit amount on the bank account'; end if;
 insert into public.account_bank_reconciliation_items(reconciliation_id,transaction_date,description,reference_no,amount,direction,matched_journal_line_id)
 values(r.id,p_date,p_description,coalesce(p_reference,''),p_amount,p_direction,p_journal_line) returning id into iid;
 return iid;
end;$$;

create or replace function public.account_reconcile_bank(p_id uuid,p_notes text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.account_bank_reconciliations%rowtype; unmatched integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.account_bank_reconciliations where id=p_id for update;
 if not found or r.status<>'draft' then raise exception 'Draft reconciliation not found'; end if;
 if not public.accounts_feature_access(r.institution,'m46',true) then raise exception 'Not authorized'; end if;
 if r.difference<>0 then raise exception 'Statement closing balance and book balance do not match'; end if;
 select count(*) into unmatched from public.account_bank_reconciliation_items where reconciliation_id=r.id and matched_journal_line_id is null;
 if unmatched>0 then raise exception 'Every statement line must be matched to a posted journal line'; end if;
 update public.account_bank_reconciliations set status='reconciled',notes=coalesce(p_notes,notes),reconciled_by=auth.uid(),reconciled_at=now() where id=p_id;
end;$$;
