-- Link ledger entries to selected cash/bank accounts and record obligation payments
-- through the normal ledger approval and double-entry posting flow.
alter table public.ledger_entries add column if not exists bank_account_id uuid references public.account_bank_accounts(id) on delete restrict;
create index if not exists ledger_entries_bank_account_date_idx on public.ledger_entries(institution,bank_account_id,entry_date desc) where bank_account_id is not null;
create or replace function public.validate_ledger_bank_account() returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_kind text;v_active boolean;
begin
 if new.bank_account_id is null then return new;end if;
 select account_kind,is_active into v_kind,v_active from public.account_bank_accounts where id=new.bank_account_id and institution=new.institution;
 if not found or not v_active then raise exception 'Selected cash/bank account is missing or inactive for this institution';end if;
 if v_kind<>new.payment_method then raise exception 'Selected account type does not match payment method';end if;
 return new;
end;$function$;
drop trigger if exists ledger_validate_bank_account on public.ledger_entries;
create trigger ledger_validate_bank_account before insert or update of bank_account_id,institution,payment_method on public.ledger_entries for each row execute function public.validate_ledger_bank_account();

create table if not exists public.account_obligation_payments(
 id uuid primary key default gen_random_uuid(),institution text not null,
 obligation_id uuid not null references public.account_obligations(id) on delete restrict,
 ledger_entry_id uuid not null unique references public.ledger_entries(id) on delete restrict,
 amount numeric(16,2) not null check(amount>0),payment_date date not null,
 payment_method text not null check(payment_method in('cash','bank','mobile_banking')),
 bank_account_id uuid references public.account_bank_accounts(id) on delete restrict,
 reference_no text not null default '',note text not null default '',
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),
 approved_at timestamptz,created_at timestamptz not null default now(),
 constraint account_obligation_payments_institution_check check(institution in('mosque','foundation'))
);
create index if not exists account_obligation_payments_obligation_idx on public.account_obligation_payments(institution,obligation_id,status);
alter table public.account_obligation_payments enable row level security;
drop policy if exists account_obligation_payments_read on public.account_obligation_payments;
create policy account_obligation_payments_read on public.account_obligation_payments for select to authenticated using(
 public.accounts_feature_access(institution,'m69',false) or public.account_module_permission(institution,array['m80'],false,false)
);
drop trigger if exists account_obligation_payments_audit on public.account_obligation_payments;
create trigger account_obligation_payments_audit after insert or update or delete on public.account_obligation_payments for each row execute function public.log_account_feature_change();

create or replace function public.account_submit_obligation_payment(p_institution text,p_obligation uuid,p_amount numeric,p_payment_date date,p_payment_method text,p_bank_account_id uuid default null,p_reference_no text default '',p_note text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare o public.account_obligations%rowtype;v_pending numeric(16,2);v_available numeric(16,2);v_entry uuid;v_kind text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not public.accounts_feature_access(p_institution,'m69',true) then raise exception 'Obligation payment permission required';end if;
 if p_amount is null or p_amount<=0 or p_payment_method is null or p_payment_method not in('cash','bank','mobile_banking') then raise exception 'Invalid payment amount or method';end if;
 if p_payment_date is null then raise exception 'Payment date is required';end if;
 select * into o from public.account_obligations where id=p_obligation and institution=p_institution for update;
 if not found or o.status in('settled','cancelled') then raise exception 'Open obligation not found';end if;
 select coalesce(sum(amount),0) into v_pending from public.account_obligation_payments where institution=p_institution and obligation_id=p_obligation and status='pending';
 v_available:=o.amount-o.settled_amount-v_pending;
 if p_amount>v_available then raise exception 'Payment exceeds the remaining amount after pending approvals: %',v_available;end if;
 if p_bank_account_id is not null then
  select account_kind into v_kind from public.account_bank_accounts where id=p_bank_account_id and institution=p_institution and is_active;
  if not found or v_kind<>p_payment_method then raise exception 'Selected payment account is invalid for this payment method';end if;
 end if;
 insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category,bank_account_id)
 values(p_institution,case when o.obligation_type='receivable' then 'income' else 'expense' end,p_payment_date,
  (case when o.obligation_type='receivable' then 'পাওনা আদায়: ' else 'দেনা পরিশোধ: ' end)||left(coalesce(o.description,o.party_name),120),
  p_amount,o.party_name,p_payment_method,coalesce(p_reference_no,''),concat_ws(' · ',nullif(p_note,''),'Obligation ID: '||o.id),'pending',auth.uid(),'general',p_bank_account_id)
 returning id into v_entry;
 insert into public.account_obligation_payments(institution,obligation_id,ledger_entry_id,amount,payment_date,payment_method,bank_account_id,reference_no,note,created_by)
 values(p_institution,p_obligation,v_entry,p_amount,p_payment_date,p_payment_method,p_bank_account_id,coalesce(p_reference_no,''),coalesce(p_note,''),auth.uid());
 return v_entry;
end;$function$;

create or replace function public.sync_obligation_payment_from_ledger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare p public.account_obligation_payments%rowtype;
begin
 if old.status<>'pending' or new.status not in('approved','rejected') then return new;end if;
 select * into p from public.account_obligation_payments where ledger_entry_id=new.id and status='pending' for update;
 if not found then return new;end if;
 update public.account_obligation_payments set status=new.status,approved_by=new.approved_by,approved_at=new.approved_at where id=p.id;
 if new.status='approved' then
  update public.account_obligations set settled_amount=least(amount,settled_amount+p.amount),
   status=case when least(amount,settled_amount+p.amount)>=amount then 'settled' when least(amount,settled_amount+p.amount)>0 then 'partial' else 'open' end,
   updated_at=now() where id=p.obligation_id and institution=p.institution;
 end if;
 return new;
end;$function$;
drop trigger if exists ledger_sync_obligation_payment on public.ledger_entries;
create trigger ledger_sync_obligation_payment after update of status on public.ledger_entries for each row execute function public.sync_obligation_payment_from_ledger();

create or replace function public.post_approved_ledger_entry_to_journal() returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_journal uuid;v_asset_code text;v_income_code text;v_expense_code text;
begin
 if new.status<>'approved' or old.status='approved' then return new;end if;
 if new.bank_account_id is not null then
  select account_code into v_asset_code from public.account_bank_accounts where id=new.bank_account_id and institution=new.institution and is_active;
  if v_asset_code is null then raise exception 'Selected bank account is unavailable';end if;
 else
  v_asset_code:=case new.payment_method when 'bank' then '1010' when 'mobile_banking' then '1020' else '1000' end;
 end if;
 v_income_code:=case when new.fund_category in('zakat','sadaqah') then '4010' else '4000' end;
 v_expense_code:=case when new.fund_category in('zakat','sadaqah') then '5010' else '5000' end;
 insert into public.account_journal_entries(institution,journal_date,description,source_type,source_id,created_by)
 values(new.institution,new.entry_date,coalesce(nullif(new.note,''),new.category)||' · '||coalesce(new.payer_or_payee,''),'ledger_entry',new.id,new.created_by)
 on conflict(source_type,source_id) do nothing returning id into v_journal;
 if v_journal is null then return new;end if;
 if new.entry_type='income' then
  insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit) values(v_journal,new.institution,v_asset_code,new.category,new.amount,0),(v_journal,new.institution,v_income_code,new.category,0,new.amount);
 else
  insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit) values(v_journal,new.institution,v_expense_code,new.category,new.amount,0),(v_journal,new.institution,v_asset_code,new.category,0,new.amount);
 end if;
 return new;
end;$function$;

drop policy if exists accounts_detail_audit_obligation_payments_read on public.audit_logs;
create policy accounts_detail_audit_obligation_payments_read on public.audit_logs for select to authenticated using(
 table_name='account_obligation_payments' and public.accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m79',false)
);

revoke all on function public.account_submit_obligation_payment(text,uuid,numeric,date,text,uuid,text,text) from public, anon;
grant execute on function public.account_submit_obligation_payment(text,uuid,numeric,date,text,uuid,text,text) to authenticated;
