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

-- Header creation is only possible through a server-side function that calculates the book balance.
drop policy if exists account_bank_reconciliations_insert on public.account_bank_reconciliations;
drop policy if exists account_bank_reconciliations_update on public.account_bank_reconciliations;

create or replace function public.account_create_bank_reconciliation(
  p_institution text,
  p_bank_account uuid,
  p_statement_date date,
  p_statement_opening numeric,
  p_statement_closing numeric,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  bank public.account_bank_accounts%rowtype;
  book numeric;
  difference_amount numeric;
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_statement_date is null then raise exception 'Statement date is required'; end if;
  if not public.accounts_feature_access(p_institution,'m46',true) then raise exception 'Not authorized'; end if;
  select * into bank from public.account_bank_accounts
   where id=p_bank_account and institution=p_institution and is_active for update;
  if not found then raise exception 'Active bank/cash account not found for this institution'; end if;
  select coalesce(sum(l.debit-l.credit),0) into book
    from public.account_journal_lines l
    join public.account_journal_entries j on j.id=l.journal_id
   where l.institution=p_institution and l.account_code=bank.account_code
     and j.institution=p_institution and j.status='posted';
  book:=round(book,2);
  difference_amount:=round(p_statement_closing-book,2);
  insert into public.account_bank_reconciliations(
    institution,bank_account_id,statement_date,statement_opening,statement_closing,
    book_balance,difference,status,notes,created_by
  ) values(
    p_institution,p_bank_account,p_statement_date,p_statement_opening,p_statement_closing,
    book,difference_amount,'draft',coalesce(p_notes,''),auth.uid()
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) to authenticated;

create or replace function public.account_bank_reconciliation_candidates(p_bank_account uuid)
returns table (
  id uuid,
  transaction_date date,
  journal_no bigint,
  line_description text,
  debit numeric,
  credit numeric
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select l.id,j.journal_date,j.journal_no,coalesce(nullif(l.description,''),j.description),l.debit,l.credit
    from public.account_bank_accounts b
    join public.account_journal_lines l on l.account_code=b.account_code and l.institution=b.institution
    join public.account_journal_entries j on j.id=l.journal_id and j.institution=b.institution
   where (select auth.uid()) is not null
     and b.id=p_bank_account and b.is_active
     and public.accounts_feature_access(b.institution,'m46',false)
     and j.status='posted'
   order by j.journal_date desc,j.journal_no desc,l.created_at desc
   limit 1000;
$$;
revoke all on function public.account_bank_reconciliation_candidates(uuid) from public,anon;
grant execute on function public.account_bank_reconciliation_candidates(uuid) to authenticated;

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

-- Allow owners to remove only their own unfinalized reconciliation drafts and lines.
drop policy if exists account_bank_reconciliation_items_delete on public.account_bank_reconciliation_items;
create policy account_bank_reconciliation_items_delete
on public.account_bank_reconciliation_items for delete to authenticated
using (
  exists (
    select 1 from public.account_bank_reconciliations r
    where r.id = reconciliation_id
      and r.status = 'draft'
      and r.created_by = (select auth.uid())
      and public.accounts_feature_access(r.institution,'m46',true)
  )
);

drop policy if exists account_bank_reconciliations_delete on public.account_bank_reconciliations;
create policy account_bank_reconciliations_delete
on public.account_bank_reconciliations for delete to authenticated
using (
  status = 'draft'
  and created_by = (select auth.uid())
  and public.accounts_feature_access(institution,'m46',true)
);

-- Reconciliation balance and candidate lines are bounded by the statement date.
create or replace function public.account_create_bank_reconciliation(
  p_institution text,
  p_bank_account uuid,
  p_statement_date date,
  p_statement_opening numeric,
  p_statement_closing numeric,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  bank public.account_bank_accounts%rowtype;
  book numeric;
  difference_amount numeric;
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_statement_date is null or p_statement_opening is null or p_statement_closing is null then raise exception 'Statement date and balances are required'; end if;
  if not public.accounts_feature_access(p_institution,'m46',true) then raise exception 'Not authorized'; end if;
  select * into bank from public.account_bank_accounts
   where id=p_bank_account and institution=p_institution and is_active for update;
  if not found then raise exception 'Active bank/cash account not found for this institution'; end if;
  select coalesce(sum(l.debit-l.credit),0) into book
    from public.account_journal_lines l
    join public.account_journal_entries j on j.id=l.journal_id
   where l.institution=p_institution and l.account_code=bank.account_code
     and j.institution=p_institution and j.status='posted' and j.journal_date<=p_statement_date;
  book:=round(book,2);
  difference_amount:=round(p_statement_closing-book,2);
  insert into public.account_bank_reconciliations(
    institution,bank_account_id,statement_date,statement_opening,statement_closing,
    book_balance,difference,status,notes,created_by
  ) values(
    p_institution,p_bank_account,p_statement_date,p_statement_opening,p_statement_closing,
    book,difference_amount,'draft',coalesce(p_notes,''),auth.uid()
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) to authenticated;

drop function if exists public.account_bank_reconciliation_candidates(uuid);
create function public.account_bank_reconciliation_candidates(p_bank_account uuid,p_statement_date date)
returns table (
  id uuid,
  transaction_date date,
  journal_no bigint,
  line_description text,
  debit numeric,
  credit numeric
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select l.id,j.journal_date,j.journal_no,coalesce(nullif(l.description,''),j.description),l.debit,l.credit
    from public.account_bank_accounts b
    join public.account_journal_lines l on l.account_code=b.account_code and l.institution=b.institution
    join public.account_journal_entries j on j.id=l.journal_id and j.institution=b.institution
   where (select auth.uid()) is not null
     and b.id=p_bank_account and b.is_active
     and p_statement_date is not null
     and public.accounts_feature_access(b.institution,'m46',false)
     and j.status='posted' and j.journal_date<=p_statement_date
   order by j.journal_date desc,j.journal_no desc,l.created_at desc
   limit 1000;
$$;
revoke all on function public.account_bank_reconciliation_candidates(uuid,date) from public,anon;
grant execute on function public.account_bank_reconciliation_candidates(uuid,date) to authenticated;

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
  if new.amount is null or new.amount<=0 or new.direction not in ('deposit','withdrawal') then
    raise exception 'A positive amount and valid direction are required';
  end if;
  select r.institution,r.status,r.statement_date,b.account_code
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
$$;

-- Treat NULL direction as invalid as well as unknown direction values.
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
$$;

create or replace function public.account_bank_reconciliation_candidates(p_bank_account uuid,p_statement_date date)
returns table (
  id uuid,
  transaction_date date,
  journal_no bigint,
  line_description text,
  debit numeric,
  credit numeric
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select l.id,j.journal_date,j.journal_no,coalesce(nullif(l.description,''),j.description),l.debit,l.credit
    from public.account_bank_accounts b
    join public.account_journal_lines l on l.account_code=b.account_code and l.institution=b.institution
    join public.account_journal_entries j on j.id=l.journal_id and j.institution=b.institution
   where (select auth.uid()) is not null
     and b.id=p_bank_account and b.is_active
     and p_statement_date is not null
     and public.accounts_feature_access(b.institution,'m46',false)
     and j.status='posted' and j.journal_date<=p_statement_date
     and not exists (
       select 1 from public.account_bank_reconciliation_items ri
       where ri.matched_journal_line_id=l.id
     )
   order by j.journal_date desc,j.journal_no desc,l.created_at desc
   limit 1000;
$$;
revoke all on function public.account_bank_reconciliation_candidates(uuid,date) from public,anon;
grant execute on function public.account_bank_reconciliation_candidates(uuid,date) to authenticated;


create unique index if not exists account_bank_reconciliations_unique_account_date_idx
on public.account_bank_reconciliations(bank_account_id,statement_date);

create or replace function public.account_create_bank_reconciliation(
  p_institution text,
  p_bank_account uuid,
  p_statement_date date,
  p_statement_opening numeric,
  p_statement_closing numeric,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  bank public.account_bank_accounts%rowtype;
  book numeric;
  difference_amount numeric;
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_statement_date is null or p_statement_opening is null or p_statement_closing is null then raise exception 'Statement date and balances are required'; end if;
  if not public.accounts_feature_access(p_institution,'m46',true) then raise exception 'Not authorized'; end if;
  select * into bank from public.account_bank_accounts
   where id=p_bank_account and institution=p_institution and is_active for update;
  if not found then raise exception 'Active bank/cash account not found for this institution'; end if;
  if exists(select 1 from public.account_bank_reconciliations r where r.bank_account_id=p_bank_account and r.statement_date=p_statement_date) then
    raise exception 'A reconciliation already exists for this account and statement date';
  end if;
  select coalesce(sum(l.debit-l.credit),0) into book
    from public.account_journal_lines l
    join public.account_journal_entries j on j.id=l.journal_id
   where l.institution=p_institution and l.account_code=bank.account_code
     and j.institution=p_institution and j.status='posted' and j.journal_date<=p_statement_date;
  book:=round(book,2);
  difference_amount:=round(p_statement_closing-book,2);
  insert into public.account_bank_reconciliations(
    institution,bank_account_id,statement_date,statement_opening,statement_closing,
    book_balance,difference,status,notes,created_by
  ) values(
    p_institution,p_bank_account,p_statement_date,p_statement_opening,p_statement_closing,
    book,difference_amount,'draft',coalesce(p_notes,''),auth.uid()
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text) to authenticated;
