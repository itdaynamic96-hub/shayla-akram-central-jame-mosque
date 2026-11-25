-- Enterprise accounts extension for mosque/foundation.
-- Applied to Supabase project lmwczibsipczfymhyqba. Keep this file for future recovery.
create or replace function public.accounts_feature_access(target_institution text, target_module text, write_access boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
 select auth.uid() is not null and exists (
  select 1 from public.profiles p where p.id=auth.uid()
   and (p.institution='both' or p.institution=target_institution)
   and (p.role='super_admin'
    or p.role in ('admin','accounts_manager','accountant','mosque_admin','foundation_admin')
    or (not write_access and p.role='auditor')
    or exists(select 1 from public.admin_module_permissions amp where amp.user_id=auth.uid() and amp.module_key=target_module and amp.can_view and (not write_access or amp.can_write)))
   and (p.role<>'mosque_admin' or target_institution='mosque')
   and (p.role<>'foundation_admin' or target_institution='foundation')
 );
$$;
revoke all on function public.accounts_feature_access(text,text,boolean) from public,anon;
grant execute on function public.accounts_feature_access(text,text,boolean) to authenticated;

create table if not exists public.account_staff(
 id uuid primary key default gen_random_uuid(), institution text not null check(institution in('mosque','foundation')),
 employee_no text not null, full_name text not null check(length(trim(full_name)) between 1 and 140),
 job_title text not null default '', phone text not null default '', monthly_salary numeric(14,2) not null check(monthly_salary>0),
 join_date date, is_active boolean not null default true, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(institution,employee_no)
);
create index if not exists account_staff_institution_active_idx on public.account_staff(institution,is_active,full_name);
create table if not exists public.payroll_records(
 id uuid primary key default gen_random_uuid(), institution text not null check(institution in('mosque','foundation')),
 staff_id uuid not null references public.account_staff(id), payroll_month text not null check(payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 base_salary numeric(14,2) not null check(base_salary>0), bonus numeric(14,2) not null default 0 check(bonus>=0),
 deductions numeric(14,2) not null default 0 check(deductions>=0), net_amount numeric(14,2) generated always as(base_salary+bonus-deductions) stored,
 status text not null default 'pending' check(status in('pending','approved','paid','rejected')), payment_date date,
 payment_method text not null default 'cash' check(payment_method in('cash','bank','mobile_banking','other')),
 reference_no text not null default '', note text not null default '', created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(),
 unique(staff_id,payroll_month), check(base_salary+bonus-deductions>0)
);
create index if not exists payroll_records_month_idx on public.payroll_records(institution,payroll_month desc,status);
create table if not exists public.account_obligations(
 id uuid primary key default gen_random_uuid(), institution text not null check(institution in('mosque','foundation')),
 obligation_type text not null check(obligation_type in('receivable','payable')), party_name text not null check(length(trim(party_name)) between 1 and 160),
 description text not null default '', amount numeric(14,2) not null check(amount>0), settled_amount numeric(14,2) not null default 0 check(settled_amount>=0),
 due_date date, status text not null default 'open' check(status in('open','partial','settled','cancelled')), reference_no text not null default '',
 created_by uuid not null references auth.users(id), updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
 check(settled_amount<=amount), check((status='settled' and settled_amount=amount) or (status<>'settled' and settled_amount<amount))
);
create index if not exists account_obligations_due_idx on public.account_obligations(institution,status,due_date);
create table if not exists public.account_assets(
 id uuid primary key default gen_random_uuid(), institution text not null check(institution in('mosque','foundation')),
 asset_name text not null check(length(trim(asset_name)) between 1 and 160), asset_category text not null default 'অন্যান্য',
 acquisition_date date, acquisition_cost numeric(14,2) not null check(acquisition_cost>=0), location text not null default '',
 condition_note text not null default '', asset_status text not null default 'active' check(asset_status in('active','repair','disposed')),
 reference_no text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists account_assets_institution_idx on public.account_assets(institution,asset_status);
alter table public.account_staff enable row level security;
alter table public.payroll_records enable row level security;
alter table public.account_obligations enable row level security;
alter table public.account_assets enable row level security;
drop policy if exists account_staff_read on public.account_staff;
create policy account_staff_read on public.account_staff for select to authenticated using(public.accounts_feature_access(institution,'m43',false));
drop policy if exists account_staff_insert on public.account_staff;
create policy account_staff_insert on public.account_staff for insert to authenticated with check(public.accounts_feature_access(institution,'m43',true) and created_by=auth.uid());
drop policy if exists account_staff_update on public.account_staff;
create policy account_staff_update on public.account_staff for update to authenticated using(public.accounts_feature_access(institution,'m43',true)) with check(public.accounts_feature_access(institution,'m43',true));
drop policy if exists payroll_read on public.payroll_records;
create policy payroll_read on public.payroll_records for select to authenticated using(public.accounts_feature_access(institution,'m43',false));
drop policy if exists payroll_insert on public.payroll_records;
create policy payroll_insert on public.payroll_records for insert to authenticated with check(public.accounts_feature_access(institution,'m43',true) and created_by=auth.uid() and status='pending');
drop policy if exists payroll_update on public.payroll_records;
create policy payroll_update on public.payroll_records for update to authenticated using(public.accounts_feature_access(institution,'m43',true)) with check(public.accounts_feature_access(institution,'m43',true));
drop policy if exists obligations_read on public.account_obligations;
create policy obligations_read on public.account_obligations for select to authenticated using(public.accounts_feature_access(institution,'m43',false));
drop policy if exists obligations_insert on public.account_obligations;
create policy obligations_insert on public.account_obligations for insert to authenticated with check(public.accounts_feature_access(institution,'m43',true) and created_by=auth.uid());
drop policy if exists obligations_update on public.account_obligations;
create policy obligations_update on public.account_obligations for update to authenticated using(public.accounts_feature_access(institution,'m43',true)) with check(public.accounts_feature_access(institution,'m43',true));
drop policy if exists assets_read on public.account_assets;
create policy assets_read on public.account_assets for select to authenticated using(public.accounts_feature_access(institution,'m43',false));
drop policy if exists assets_insert on public.account_assets;
create policy assets_insert on public.account_assets for insert to authenticated with check(public.accounts_feature_access(institution,'m43',true) and created_by=auth.uid());
drop policy if exists assets_update on public.account_assets;
create policy assets_update on public.account_assets for update to authenticated using(public.accounts_feature_access(institution,'m43',true)) with check(public.accounts_feature_access(institution,'m43',true));
grant select,insert,update on public.account_staff,public.payroll_records,public.account_obligations,public.account_assets to authenticated;
create or replace function public.log_account_feature_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.audit_logs(actor,table_name,record_id,action,before_data,after_data)
 values(auth.uid(),tg_table_name,coalesce(new.id,old.id)::text,tg_op,
 case when tg_op in('UPDATE','DELETE') then to_jsonb(old) else null end,
 case when tg_op in('INSERT','UPDATE') then to_jsonb(new) else null end);
 if tg_op='DELETE' then return old; end if; return new;
end;$$;
revoke all on function public.log_account_feature_change() from public,anon,authenticated;
drop trigger if exists account_staff_audit on public.account_staff;
create trigger account_staff_audit after insert or update or delete on public.account_staff for each row execute function public.log_account_feature_change();
drop trigger if exists payroll_records_audit on public.payroll_records;
create trigger payroll_records_audit after insert or update or delete on public.payroll_records for each row execute function public.log_account_feature_change();
drop trigger if exists account_obligations_audit on public.account_obligations;
create trigger account_obligations_audit after insert or update or delete on public.account_obligations for each row execute function public.log_account_feature_change();
drop trigger if exists account_assets_audit on public.account_assets;
create trigger account_assets_audit after insert or update or delete on public.account_assets for each row execute function public.log_account_feature_change();
alter table public.payroll_records add column if not exists ledger_entry_id uuid unique references public.ledger_entries(id);
drop policy if exists "accounts staff read enterprise audit logs" on public.audit_logs;
create policy "accounts staff read enterprise audit logs" on public.audit_logs for select to authenticated using(
 table_name in('account_staff','payroll_records','account_obligations','account_assets')
 and (public.accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m43',false)
 or public.accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m50',false))
);
create or replace function public.mark_payroll_paid(target_payroll uuid,paid_on date,paid_via text,payment_reference text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.payroll_records%rowtype; s public.account_staff%rowtype; new_ledger_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into p from public.payroll_records where id=target_payroll for update;
 if not found then raise exception 'Payroll record not found'; end if;
 if not public.accounts_feature_access(p.institution,'m43',true) then raise exception 'Not authorized'; end if;
 if p.status<>'approved' then raise exception 'Only approved payroll can be marked paid'; end if;
 if p.ledger_entry_id is not null then raise exception 'Payroll already has a ledger entry'; end if;
 if paid_via not in('cash','bank','mobile_banking','other') then raise exception 'Invalid payment method'; end if;
 select * into s from public.account_staff where id=p.staff_id;
 if not found then raise exception 'Staff member not found'; end if;
 insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category)
 values(p.institution,'expense',coalesce(paid_on,current_date),'ইমাম ও কর্মচারীদের বেতন',p.net_amount,s.full_name,paid_via,coalesce(payment_reference,''),'Payroll month: '||p.payroll_month||' · payroll id: '||p.id::text,'pending',auth.uid(),'general')
 returning id into new_ledger_id;
 update public.payroll_records set status='paid',payment_date=coalesce(paid_on,current_date),payment_method=paid_via,reference_no=coalesce(payment_reference,''),ledger_entry_id=new_ledger_id where id=p.id;
 return new_ledger_id;
end;$$;
revoke all on function public.mark_payroll_paid(uuid,date,text,text) from public,anon;
grant execute on function public.mark_payroll_paid(uuid,date,text,text) to authenticated;
create or replace view public.account_cash_bank_book with (security_invoker=true) as
select id,institution,entry_date,entry_type,category,fund_category,amount,payer_or_payee,payment_method,reference_no,note,status,created_at
from public.ledger_entries where status='approved' and payment_method in('cash','bank','mobile_banking');
grant select on public.account_cash_bank_book to authenticated;

create or replace function public.guard_payroll_record_changes()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Payroll history cannot be deleted'; end if;
 if old.status in ('paid','rejected') then raise exception 'Finalized payroll records are immutable'; end if;
 if new.institution<>old.institution or new.staff_id<>old.staff_id or new.payroll_month<>old.payroll_month
    or new.base_salary<>old.base_salary or new.bonus<>old.bonus or new.deductions<>old.deductions
    or new.created_by<>old.created_by then raise exception 'Payroll financial details cannot be changed after creation'; end if;
 if old.status='pending' and new.status not in ('pending','approved','rejected') then raise exception 'Invalid payroll status transition'; end if;
 if old.status='approved' and new.status<>'paid' then raise exception 'Approved payroll can only move to paid'; end if;
 if new.status in ('approved','rejected') and (new.approved_by is distinct from auth.uid() or new.approved_at is null) then raise exception 'Payroll approval identity and timestamp are required'; end if;
 if new.status='paid' and new.ledger_entry_id is null then raise exception 'A ledger entry is required before marking payroll paid'; end if;
 return new;
end;$$;
drop trigger if exists guard_payroll_record_changes_trigger on public.payroll_records;
create trigger guard_payroll_record_changes_trigger before update or delete on public.payroll_records for each row execute function public.guard_payroll_record_changes();
revoke all on function public.guard_payroll_record_changes() from public,anon,authenticated;
create index if not exists account_staff_created_by_idx on public.account_staff(created_by);
create index if not exists payroll_records_staff_id_idx on public.payroll_records(staff_id);
create index if not exists payroll_records_created_by_idx on public.payroll_records(created_by);
create index if not exists payroll_records_approved_by_idx on public.payroll_records(approved_by);
create index if not exists account_obligations_created_by_idx on public.account_obligations(created_by);
create index if not exists account_assets_created_by_idx on public.account_assets(created_by);
