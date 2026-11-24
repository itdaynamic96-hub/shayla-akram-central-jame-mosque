-- SAKM-61 monthly mosque contributions: member profiles, rate history, allocations and linked ledger entries.
-- Apply only after schema.sql and module-permissions.sql. No existing financial rows are modified.
begin;

create table if not exists public.contribution_members (
 id uuid primary key default gen_random_uuid(),
 institution text not null default 'mosque' check (institution='mosque'),
 name text not null check (length(trim(name)) between 1 and 160),
 father_name text not null default '',
 house_name text not null default '',
 address text not null default '',
 mobile text not null default '',
 start_month date not null check (extract(day from start_month)=1),
 sms_consent boolean not null default false,
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists contribution_members_name_idx on public.contribution_members(institution,name);
create index if not exists contribution_members_active_idx on public.contribution_members(institution,active);

create table if not exists public.contribution_rates (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.contribution_members(id),
 effective_month date not null check (extract(day from effective_month)=1),
 monthly_amount numeric(14,2) not null check (monthly_amount>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(member_id,effective_month)
);
create index if not exists contribution_rates_member_month_idx on public.contribution_rates(member_id,effective_month desc);

create table if not exists public.contribution_payments (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.contribution_members(id),
 institution text not null default 'mosque' check (institution='mosque'),
 ledger_entry_id uuid not null unique references public.ledger_entries(id),
 payment_date date not null,
 amount numeric(14,2) not null check (amount>0),
 payment_method text not null check (payment_method in ('cash','bank','mobile_banking','bkash','nagad','other')),
 receipt_no text not null default '',
 note text not null default '',
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists contribution_payments_member_date_idx on public.contribution_payments(member_id,payment_date desc);
create index if not exists contribution_payments_status_idx on public.contribution_payments(institution,status);

create table if not exists public.contribution_payment_allocations (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null references public.contribution_payments(id),
 member_id uuid not null references public.contribution_members(id),
 covered_month date not null check (extract(day from covered_month)=1),
 amount numeric(14,2) not null check (amount>0),
 created_at timestamptz not null default now(),
 unique(payment_id,covered_month)
);
create index if not exists contribution_allocations_member_month_idx on public.contribution_payment_allocations(member_id,covered_month);

create table if not exists public.contribution_reminder_log (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.contribution_members(id),
 reminder_month date not null check (extract(day from reminder_month)=1),
 channel text not null default 'sms' check (channel='sms'),
 status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
 provider_reference text not null default '',
 error_message text not null default '',
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(member_id,reminder_month,channel)
);

create or replace function public.can_manage_contributions(target_institution text, write_access boolean default false)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=auth.uid()
    and p.institution in ('both',target_institution)
    and (
      p.role in ('super_admin','accounts_manager','accountant')
      or (not write_access and p.role in ('auditor','mosque_admin'))
      or (
        p.role='custom_admin'
        and exists(select 1 from public.admin_module_permissions mp
          where mp.user_id=p.id and mp.module_key='m44' and mp.can_view
            and (not write_access or mp.can_write))
        and exists(select 1 from public.admin_module_permissions mp
          where mp.user_id=p.id and mp.module_key='m47' and mp.can_view
            and (not write_access or mp.can_write))
      )
    )
 );
$$;
revoke all on function public.can_manage_contributions(text,boolean) from public,anon;
grant execute on function public.can_manage_contributions(text,boolean) to authenticated;

alter table public.contribution_members enable row level security;
alter table public.contribution_rates enable row level security;
alter table public.contribution_payments enable row level security;
alter table public.contribution_payment_allocations enable row level security;
alter table public.contribution_reminder_log enable row level security;

drop policy if exists "contribution members read by accounts" on public.contribution_members;
create policy "contribution members read by accounts" on public.contribution_members for select to authenticated
using(public.can_manage_contributions(institution,false));
drop policy if exists "contribution members insert by accounts" on public.contribution_members;
create policy "contribution members insert by accounts" on public.contribution_members for insert to authenticated
with check(created_by=auth.uid() and public.can_manage_contributions(institution,true));
drop policy if exists "contribution members update by accounts" on public.contribution_members;
create policy "contribution members update by accounts" on public.contribution_members for update to authenticated
using(public.can_manage_contributions(institution,true))
with check(public.can_manage_contributions(institution,true));
drop policy if exists "contribution rates read by accounts" on public.contribution_rates;
create policy "contribution rates read by accounts" on public.contribution_rates for select to authenticated
using(exists(select 1 from public.contribution_members m where m.id=member_id and public.can_manage_contributions(m.institution,false)));
drop policy if exists "contribution payments read by accounts" on public.contribution_payments;
create policy "contribution payments read by accounts" on public.contribution_payments for select to authenticated
using(public.can_manage_contributions(institution,false));
drop policy if exists "contribution allocations read by accounts" on public.contribution_payment_allocations;
create policy "contribution allocations read by accounts" on public.contribution_payment_allocations for select to authenticated
using(exists(select 1 from public.contribution_members m where m.id=member_id and public.can_manage_contributions(m.institution,false)));
drop policy if exists "contribution reminder log read by accounts" on public.contribution_reminder_log;
create policy "contribution reminder log read by accounts" on public.contribution_reminder_log for select to authenticated
using(exists(select 1 from public.contribution_members m where m.id=member_id and public.can_manage_contributions(m.institution,false)));

grant select,insert,update on public.contribution_members to authenticated;
grant select on public.contribution_rates,public.contribution_payments,public.contribution_payment_allocations,public.contribution_reminder_log to authenticated;

create or replace function public.save_contribution_member(
 target_member uuid,
 member_name text,
 member_father_name text,
 member_house_name text,
 member_address text,
 member_mobile text,
 member_start_month date,
 member_monthly_amount numeric,
 member_rate_effective_month date,
 member_sms_consent boolean default false
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
 v_id uuid;
 v_old_amount numeric;
begin
 if auth.uid() is null or not public.can_manage_contributions('mosque',true) then
   raise exception 'আপনার মাসিক চাঁদা ব্যবস্থাপনার অনুমতি নেই।';
 end if;
 if length(trim(coalesce(member_name,''))) not between 1 and 160 then raise exception 'নাম সঠিকভাবে লিখুন।'; end if;
 if member_start_month is null or extract(day from member_start_month)<>1 then raise exception 'শুরুর মাসের প্রথম তারিখ নির্বাচন করুন।'; end if;
 if member_rate_effective_month is null or extract(day from member_rate_effective_month)<>1 then raise exception 'চাঁদার হার কার্যকর হওয়ার মাস নির্বাচন করুন।'; end if;
 if member_monthly_amount is null or member_monthly_amount<=0 then raise exception 'মাসিক চাঁদা শূন্যের বেশি হতে হবে।'; end if;
 if target_member is null and member_rate_effective_month<>member_start_month then raise exception 'নতুন প্রদানকারীর প্রথম চাঁদার হার শুরুর মাস থেকেই কার্যকর হতে হবে।'; end if;
 if target_member is not null and member_rate_effective_month < date_trunc('month',current_date)::date then raise exception 'নতুন চাঁদার হার বর্তমান মাস বা ভবিষ্যৎ মাস থেকে কার্যকর করা যাবে।'; end if;
 if target_member is null then
   insert into public.contribution_members(institution,name,father_name,house_name,address,mobile,start_month,sms_consent,created_by)
   values('mosque',trim(member_name),coalesce(trim(member_father_name),''),coalesce(trim(member_house_name),''),coalesce(trim(member_address),''),coalesce(trim(member_mobile),''),member_start_month,coalesce(member_sms_consent,false),auth.uid())
   returning id into v_id;
 else
   if exists(select 1 from public.contribution_members m join public.contribution_payment_allocations a on a.member_id=m.id where m.id=target_member and m.start_month is distinct from member_start_month) then
     raise exception 'জমার ইতিহাস থাকা অবস্থায় চাঁদা শুরুর মাস পরিবর্তন করা যাবে না।';
   end if;
   update public.contribution_members set name=trim(member_name),father_name=coalesce(trim(member_father_name),''),house_name=coalesce(trim(member_house_name),''),address=coalesce(trim(member_address),''),mobile=coalesce(trim(member_mobile),''),start_month=member_start_month,sms_consent=coalesce(member_sms_consent,false),updated_at=now()
   where id=target_member and institution='mosque' returning id into v_id;
   if v_id is null then raise exception 'প্রদানকারীর তথ্য পাওয়া যায়নি।'; end if;
 end if;
 select monthly_amount into v_old_amount from public.contribution_rates where member_id=v_id and effective_month=member_rate_effective_month;
 if v_old_amount is distinct from member_monthly_amount then
   if exists(select 1 from public.contribution_payment_allocations a join public.contribution_payments p on p.id=a.payment_id where a.member_id=v_id and a.covered_month=member_rate_effective_month and p.status in ('pending','approved')) then
     raise exception 'এই মাসে জমা/অনুমোদন থাকা অবস্থায় ওই মাসের চাঁদার হার বদলানো যাবে না। পরের মাস থেকে নতুন হার দিন।';
   end if;
   insert into public.contribution_rates(member_id,effective_month,monthly_amount,created_by)
   values(v_id,member_rate_effective_month,member_monthly_amount,auth.uid())
   on conflict(member_id,effective_month) do update set monthly_amount=excluded.monthly_amount,created_by=excluded.created_by,created_at=now();
 end if;
 return v_id;
end;
$$;
revoke all on function public.save_contribution_member(uuid,text,text,text,text,text,date,numeric,date,boolean) from public,anon;
grant execute on function public.save_contribution_member(uuid,text,text,text,text,text,date,numeric,date,boolean) to authenticated;

create or replace function public.record_contribution_payment(
 target_member uuid,
 paid_on date,
 paid_amount numeric,
 paid_method text,
 paid_receipt_no text,
 paid_note text,
 covered_through date
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
 v_member public.contribution_members%rowtype;
 v_ledger uuid;
 v_payment uuid;
 v_cursor date;
 v_rate numeric;
 v_paid numeric;
 v_due numeric;
 v_allocate numeric;
 v_remaining numeric;
 v_steps integer:=0;
 v_ledger_method text;
begin
 if auth.uid() is null or not public.can_manage_contributions('mosque',true) then raise exception 'আপনার চাঁদা জমা নেওয়ার অনুমতি নেই।'; end if;
 if paid_amount is null or paid_amount<=0 then raise exception 'জমার পরিমাণ শূন্যের বেশি হতে হবে।'; end if;
 if paid_on is null or covered_through is null or extract(day from covered_through)<>1 then raise exception 'জমার তারিখ ও যে মাস পর্যন্ত জমা, তা সঠিকভাবে দিন।'; end if;
 if paid_method not in ('cash','bank','mobile_banking','bkash','nagad','other') then raise exception 'পেমেন্ট মাধ্যম সঠিক নয়।'; end if;
 select * into v_member from public.contribution_members where id=target_member and institution='mosque' and active for update;
 if not found then raise exception 'সক্রিয় চাঁদা প্রদানকারী পাওয়া যায়নি।'; end if;
 if covered_through < v_member.start_month then raise exception 'চাঁদা শুরুর মাসের আগের মাস নির্বাচন করা যাবে না।'; end if;
 v_ledger_method:=case when paid_method in ('bkash','nagad','mobile_banking') then 'mobile_banking' else paid_method end;
 insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category)
 values('mosque','income',paid_on,'মাসিক চাঁদা',paid_amount,v_member.name,v_ledger_method,coalesce(paid_receipt_no,''),coalesce(paid_note,'')||' | মাসিক চাঁদা প্রদানকারী ID: '||v_member.id::text,'pending',auth.uid(),'general')
 returning id into v_ledger;
 insert into public.contribution_payments(member_id,institution,ledger_entry_id,payment_date,amount,payment_method,receipt_no,note,status,created_by)
 values(v_member.id,'mosque',v_ledger,paid_on,paid_amount,paid_method,coalesce(paid_receipt_no,''),coalesce(paid_note,''),'pending',auth.uid())
 returning id into v_payment;
 v_cursor:=v_member.start_month;
 v_remaining:=paid_amount;
 while v_remaining>0.009 and v_steps<240 loop
   select r.monthly_amount into v_rate from public.contribution_rates r
   where r.member_id=v_member.id and r.effective_month<=v_cursor
   order by r.effective_month desc limit 1;
   if v_rate is null then raise exception 'মাস % এর জন্য নির্ধারিত চাঁদার হার নেই।',to_char(v_cursor,'YYYY-MM'); end if;
   select coalesce(sum(a.amount),0) into v_paid
   from public.contribution_payment_allocations a join public.contribution_payments p on p.id=a.payment_id
   where a.member_id=v_member.id and a.covered_month=v_cursor and p.status in ('pending','approved');
   v_due:=greatest(v_rate-v_paid,0);
   if v_due>0.009 then
     v_allocate:=least(v_due,v_remaining);
     insert into public.contribution_payment_allocations(payment_id,member_id,covered_month,amount)
     values(v_payment,v_member.id,v_cursor,v_allocate);
     v_remaining:=v_remaining-v_allocate;
   end if;
   v_cursor:=(v_cursor+interval '1 month')::date;
   v_steps:=v_steps+1;
   if v_cursor>covered_through and v_remaining<=0.009 then exit; end if;
 end loop;
 if v_remaining>0.009 then raise exception 'জমার পরিমাণ নির্ধারিত ২৪০ মাসের সীমা অতিক্রম করেছে অথবা চাঁদার হার অসম্পূর্ণ।'; end if;
 return v_payment;
end;
$$;
revoke all on function public.record_contribution_payment(uuid,date,numeric,text,text,text,date) from public,anon;
grant execute on function public.record_contribution_payment(uuid,date,numeric,text,text,text,date) to authenticated;

create or replace function public.sync_contribution_payment_status()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if new.status is distinct from old.status then
   update public.contribution_payments set status=new.status
   where ledger_entry_id=new.id and status='pending';
 end if;
 return new;
end;
$$;
drop trigger if exists ledger_sync_contribution_payment on public.ledger_entries;
create trigger ledger_sync_contribution_payment after update of status on public.ledger_entries
for each row execute function public.sync_contribution_payment_status();
revoke all on function public.sync_contribution_payment_status() from public,anon,authenticated;

commit;
