-- Bank reconciliation authorization alignment.
-- The public reconciliation RPCs use module m78. The BEFORE INSERT/UPDATE
-- trigger must enforce the same module, otherwise a user authorized for
-- reconciliation can still be rejected by the legacy m46 check.
create or replace function public.validate_account_bank_reconciliation_item()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  parent record;
  journal_line record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new.amount is null or new.amount<=0 or new.direction is null or new.direction not in ('deposit','withdrawal') then
    raise exception 'A positive amount and valid direction are required';
  end if;
  select r.institution,r.status,r.statement_date,b.account_code
    into parent
    from public.account_bank_reconciliations r
    join public.account_bank_accounts b on b.id=r.bank_account_id and b.institution=r.institution
   where r.id=new.reconciliation_id
   for update of r;
  if not found or parent.status<>'draft' then raise exception 'Draft reconciliation not found'; end if;
  if not public.accounts_feature_access(parent.institution,'m78',true) then raise exception 'Not authorized'; end if;
  if new.matched_journal_line_id is null then raise exception 'A posted journal line must be matched'; end if;
  select l.debit,l.credit,l.institution,l.account_code,j.journal_date,j.status,j.institution as journal_institution
    into journal_line
    from public.account_journal_lines l
    join public.account_journal_entries j on j.id=l.journal_id
   where l.id=new.matched_journal_line_id;
  if not found
     or journal_line.institution<>parent.institution
     or journal_line.journal_institution<>parent.institution
     or journal_line.account_code<>parent.account_code
     or journal_line.status<>'posted'
     or journal_line.journal_date<>new.transaction_date
     or journal_line.journal_date>parent.statement_date then
    raise exception 'Matched journal line must belong to this bank account, institution and statement period';
  end if;
  if new.direction='deposit' and (round(journal_line.debit,2)<>round(new.amount,2) or round(journal_line.credit,2)<>0) then
    raise exception 'Deposit must match a debit journal line for the same amount';
  elsif new.direction='withdrawal' and (round(journal_line.credit,2)<>round(new.amount,2) or round(journal_line.debit,2)<>0) then
    raise exception 'Withdrawal must match a credit journal line for the same amount';
  end if;
  return new;
end;
$function$;
