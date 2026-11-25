-- Secure bank reconciliation access and enforce statement-to-ledger matching.
alter table public.account_bank_reconciliation_items enable row level security;

drop policy if exists account_bank_reconciliation_items_read on public.account_bank_reconciliation_items;
create policy account_bank_reconciliation_items_read
on public.account_bank_reconciliation_items for select to authenticated
using (
  exists (
    select 1 from public.account_bank_reconciliations r
    where r.id = reconciliation_id
      and public.accounts_feature_access(r.institution,'m46',false)
  )
);

drop policy if exists account_bank_reconciliation_items_insert on public.account_bank_reconciliation_items;
create policy account_bank_reconciliation_items_insert
on public.account_bank_reconciliation_items for insert to authenticated
with check (
  exists (
    select 1 from public.account_bank_reconciliations r
    where r.id = reconciliation_id
      and r.status = 'draft'
      and r.created_by = (select auth.uid())
      and public.accounts_feature_access(r.institution,'m46',true)
  )
);

drop policy if exists account_bank_reconciliations_insert on public.account_bank_reconciliations;
create policy account_bank_reconciliations_insert
on public.account_bank_reconciliations for insert to authenticated
with check (
  public.accounts_feature_access(institution,'m46',true)
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.account_bank_accounts b
    where b.id = bank_account_id
      and b.institution = account_bank_reconciliations.institution
      and b.is_active
      and round(book_balance,2) = round(coalesce((
        select sum(l.debit-l.credit)
        from public.account_journal_lines l
        join public.account_journal_entries j on j.id=l.journal_id
        where l.institution=account_bank_reconciliations.institution
          and l.account_code=b.account_code
          and j.institution=account_bank_reconciliations.institution
          and j.status='posted'
      ),0),2)
      and round(difference,2) = round(statement_closing-book_balance,2)
  )
);

drop policy if exists account_bank_reconciliations_update on public.account_bank_reconciliations;

create or replace function public.validate_account_bank_reconciliation_item()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  parent record;
  journal_line record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select r.institution,r.status,b.account_code
    into parent
    from public.account_bank_reconciliations r
    join public.account_bank_accounts b on b.id=r.bank_account_id and b.institution=r.institution
   where r.id=new.reconciliation_id
   for update of r;
  if not found or parent.status<>'draft' then raise exception 'Draft reconciliation not found'; end if;
  if not public.accounts_feature_access(parent.institution,'m46',true) then raise exception 'Not authorized'; end if;
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
     or journal_line.journal_date<>new.transaction_date then
    raise exception 'Matched journal line must belong to this bank account, institution and transaction date';
  end if;
  if new.direction='deposit' and (round(journal_line.debit,2)<>round(new.amount,2) or round(journal_line.credit,2)<>0) then
    raise exception 'Deposit must match a debit journal line for the same amount';
  elsif new.direction='withdrawal' and (round(journal_line.credit,2)<>round(new.amount,2) or round(journal_line.debit,2)<>0) then
    raise exception 'Withdrawal must match a credit journal line for the same amount';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_account_bank_reconciliation_item() from public,anon,authenticated;
drop trigger if exists validate_account_bank_reconciliation_item on public.account_bank_reconciliation_items;
create trigger validate_account_bank_reconciliation_item
before insert or update on public.account_bank_reconciliation_items
for each row execute function public.validate_account_bank_reconciliation_item();

create unique index if not exists account_bank_reconciliation_items_unique_match_idx
on public.account_bank_reconciliation_items(matched_journal_line_id)
where matched_journal_line_id is not null;
