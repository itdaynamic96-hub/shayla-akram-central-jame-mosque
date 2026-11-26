-- Expense payee registry, per-job obligation history and separate actual payment receiver.
create table if not exists public.account_payees (
 id uuid primary key default gen_random_uuid(),
 institution text not null check (institution in ('mosque','foundation')),
 full_name text not null check (length(trim(full_name)) between 2 and 160),
 father_name text not null default '',
 job_title text not null default '',
 phone text not null default '',
 address text not null default '',
 payee_type text not null default 'other' check (payee_type in ('staff','worker','mason','contractor','supplier','other')),
 notes text not null default '',
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.account_obligations add column if not exists payee_id uuid references public.account_payees(id);
alter table public.account_obligations add column if not exists work_start_date date;
alter table public.account_obligations add column if not exists work_end_date date;
alter table public.account_obligation_payments add column if not exists received_by_name text not null default '';
alter table public.account_obligation_payments add column if not exists received_by_phone text not null default '';
alter table public.account_obligation_payments add column if not exists bank_name text not null default '';
alter table public.account_payees enable row level security;
grant select, insert, update on public.account_payees to authenticated;
drop policy if exists account_payees_read on public.account_payees;
create policy account_payees_read on public.account_payees for select to authenticated using (accounts_feature_access(institution,'m64',false));
drop policy if exists account_payees_insert on public.account_payees;
create policy account_payees_insert on public.account_payees for insert to authenticated with check (accounts_feature_access(institution,'m64',true) and created_by=(select auth.uid()));
drop policy if exists account_payees_update on public.account_payees;
create policy account_payees_update on public.account_payees for update to authenticated using (accounts_feature_access(institution,'m64',true)) with check (accounts_feature_access(institution,'m64',true));
create index if not exists account_payees_institution_name_idx on public.account_payees(institution,full_name);
create index if not exists account_obligations_payee_idx on public.account_obligations(payee_id);
drop policy if exists accounts_expense_payables_read on public.account_obligations;
create policy accounts_expense_payables_read on public.account_obligations for select to authenticated using (obligation_type='payable' and accounts_feature_access(institution,'m64',false));
drop policy if exists accounts_expense_payables_insert on public.account_obligations;
create policy accounts_expense_payables_insert on public.account_obligations for insert to authenticated with check (obligation_type='payable' and accounts_feature_access(institution,'m64',true) and created_by=(select auth.uid()));
drop policy if exists accounts_expense_payments_read on public.account_obligation_payments;
create policy accounts_expense_payments_read on public.account_obligation_payments for select to authenticated using (accounts_feature_access(institution,'m64',false));
drop trigger if exists account_payees_audit on public.account_payees;
create trigger account_payees_audit after insert or update or delete on public.account_payees for each row execute function public.log_account_feature_change();

create or replace function public.account_record_payable_payment(
 p_institution text,
 p_obligation uuid,
 p_amount numeric,
 p_payment_date date,
 p_payment_method text,
 p_bank_account_id uuid default null,
 p_bank_name text default '',
 p_reference_no text default '',
 p_note text default '',
 p_received_by_name text default '',
 p_received_by_phone text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
 o public.account_obligations%rowtype;
 v_entry uuid;
 v_kind text;
 v_new_settled numeric(16,2);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_institution not in ('mosque','foundation') or not public.accounts_feature_access(p_institution,'m64',true) then
  raise exception 'Expense management permission required';
 end if;
 if p_amount is null or p_amount<=0 or p_payment_method not in ('cash','bank','mobile_banking') then
  raise exception 'Invalid payment amount or method';
 end if;
 if p_payment_date is null or nullif(trim(p_received_by_name),'') is null then
  raise exception 'Payment date and receiver name are required';
 end if;
 select * into o from public.account_obligations
 where id=p_obligation and institution=p_institution and obligation_type='payable'
 for update;
 if not found or o.status in ('settled','cancelled') then raise exception 'Open payable work record not found'; end if;
 if p_amount > o.amount-o.settled_amount then raise exception 'Payment exceeds remaining balance'; end if;
 if p_payment_method='bank' and nullif(trim(p_bank_name),'') is null then raise exception 'Bank name is required'; end if;
 if p_bank_account_id is not null then
  select account_kind into v_kind from public.account_bank_accounts
  where id=p_bank_account_id and institution=p_institution and is_active;
  if not found or v_kind<>p_payment_method then raise exception 'Selected payment account is invalid'; end if;
 end if;
 insert into public.ledger_entries(
  institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,approved_by,approved_at,fund_category,bank_account_id
 ) values (
  p_institution,'expense',p_payment_date,
  'কাজের পারিশ্রমিক: '||left(coalesce(nullif(o.description,''),o.party_name),120),
  p_amount,o.party_name,p_payment_method,coalesce(p_reference_no,''),
  concat_ws(' · ',nullif(p_note,''),'প্রাপক ID: '||coalesce(o.payee_id::text,''),'টাকা গ্রহণকারী: '||trim(p_received_by_name)),
  'approved',auth.uid(),auth.uid(),now(),'general',p_bank_account_id
 ) returning id into v_entry;
 insert into public.account_obligation_payments(
  institution,obligation_id,ledger_entry_id,amount,payment_date,payment_method,bank_account_id,bank_name,reference_no,note,received_by_name,received_by_phone,status,created_by,approved_by,approved_at
 ) values (
  p_institution,o.id,v_entry,p_amount,p_payment_date,p_payment_method,p_bank_account_id,coalesce(p_bank_name,''),coalesce(p_reference_no,''),coalesce(p_note,''),trim(p_received_by_name),coalesce(p_received_by_phone,''),'approved',auth.uid(),auth.uid(),now()
 );
 v_new_settled:=o.settled_amount+p_amount;
 update public.account_obligations
 set settled_amount=v_new_settled,
     status=case when v_new_settled>=o.amount then 'settled' else 'partial' end,
     updated_at=now()
 where id=o.id;
 return v_entry;
end;
$function$;
revoke all on function public.account_record_payable_payment(text,uuid,numeric,date,text,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.account_record_payable_payment(text,uuid,numeric,date,text,uuid,text,text,text,text,text) to authenticated;
