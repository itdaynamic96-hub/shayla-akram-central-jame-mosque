-- Enterprise Premium monthly chanda: members, monthly dues, payments and reminder queue.
-- Applied to Supabase project lmwczibsipczfymhyqba on 2026-11-25.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.chanda_can_access(write_access boolean default false)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.has_access(array['super_admin','admin','mosque_admin','accounts_manager','accountant'],'mosque')
 or (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='custom_admin')
 and public.module_record_access('m51','mosque',write_access));
$$;
revoke all on function public.chanda_can_access(boolean) from public;
grant execute on function public.chanda_can_access(boolean) to authenticated;

create table if not exists public.chanda_members(
 id uuid primary key default gen_random_uuid(), institution text not null default 'mosque' check(institution='mosque'),
 member_name text not null check(length(trim(member_name)) between 2 and 140),
 father_name text not null default '', phone text not null default '', address text not null default '',
 monthly_amount numeric(12,2) not null check(monthly_amount>0), due_day smallint not null default 10 check(due_day between 1 and 28),
 reminder_channel text not null default 'in_app' check(reminder_channel in ('in_app','sms','email','whatsapp')),
 contact_consent boolean not null default false, status text not null default 'active' check(status in ('active','inactive')),
 notes text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists chanda_members_active_idx on public.chanda_members(status,institution);
create table if not exists public.chanda_dues(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.chanda_members(id),
 due_month date not null, due_date date not null, amount numeric(12,2) not null check(amount>0),
 paid_amount numeric(12,2) not null default 0 check(paid_amount>=0 and paid_amount<=amount),
 status text not null default 'unpaid' check(status in ('unpaid','partial','paid')), paid_at timestamptz,
 created_at timestamptz not null default now(), unique(member_id,due_month)
);
create index if not exists chanda_dues_due_date_idx on public.chanda_dues(due_date,status);
create table if not exists public.chanda_payments(
 id uuid primary key default gen_random_uuid(), due_id uuid not null references public.chanda_dues(id),
 member_id uuid not null references public.chanda_members(id), amount numeric(12,2) not null check(amount>0),
 payment_date date not null default (now() at time zone 'Asia/Dhaka')::date,
 payment_method text not null default 'cash' check(payment_method in ('cash','bank','bkash','nagad','other')),
 reference_no text not null default '', note text not null default '', received_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists chanda_payments_member_idx on public.chanda_payments(member_id,payment_date desc);
create table if not exists public.chanda_message_logs(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.chanda_members(id),
 due_id uuid not null references public.chanda_dues(id),
 channel text not null check(channel in ('in_app','sms','email','whatsapp')), destination text not null default '',
 message text not null, status text not null default 'queued' check(status in ('queued','sent','failed','skipped')),
 provider_response text not null default '', created_at timestamptz not null default now(), sent_at timestamptz,
 unique(due_id,channel)
);

alter table public.chanda_members enable row level security;
alter table public.chanda_dues enable row level security;
alter table public.chanda_payments enable row level security;
alter table public.chanda_message_logs enable row level security;
drop policy if exists "chanda members read authorized" on public.chanda_members;
create policy "chanda members read authorized" on public.chanda_members for select to authenticated using(public.chanda_can_access(false));
drop policy if exists "chanda members insert authorized" on public.chanda_members;
create policy "chanda members insert authorized" on public.chanda_members for insert to authenticated with check(public.chanda_can_access(true) and created_by=auth.uid());
drop policy if exists "chanda members update authorized" on public.chanda_members;
create policy "chanda members update authorized" on public.chanda_members for update to authenticated using(public.chanda_can_access(true)) with check(public.chanda_can_access(true));
drop policy if exists "chanda dues read authorized" on public.chanda_dues;
create policy "chanda dues read authorized" on public.chanda_dues for select to authenticated using(public.chanda_can_access(false));
drop policy if exists "chanda dues insert authorized" on public.chanda_dues;
create policy "chanda dues insert authorized" on public.chanda_dues for insert to authenticated with check(public.chanda_can_access(true));
drop policy if exists "chanda dues update authorized" on public.chanda_dues;
create policy "chanda dues update authorized" on public.chanda_dues for update to authenticated using(public.chanda_can_access(true)) with check(public.chanda_can_access(true));
drop policy if exists "chanda payments read authorized" on public.chanda_payments;
create policy "chanda payments read authorized" on public.chanda_payments for select to authenticated using(public.chanda_can_access(false));
drop policy if exists "chanda logs read authorized" on public.chanda_message_logs;
create policy "chanda logs read authorized" on public.chanda_message_logs for select to authenticated using(public.chanda_can_access(false));
grant select,insert,update on public.chanda_members to authenticated;
grant select,insert,update on public.chanda_dues to authenticated;
grant select on public.chanda_payments,public.chanda_message_logs to authenticated;
revoke delete on public.chanda_members,public.chanda_dues,public.chanda_payments,public.chanda_message_logs from anon,authenticated;

create or replace function public.record_chanda_payment(target_due uuid,paid_amount numeric,paid_on date default (now() at time zone 'Asia/Dhaka')::date,method text default 'cash',reference text default '',memo text default '')
returns uuid language plpgsql security definer set search_path=public
as $$
declare d public.chanda_dues%rowtype; m public.chanda_members%rowtype; payment_id uuid;
begin
 if auth.uid() is null or not public.chanda_can_access(true) then raise exception 'অনুমতি নেই'; end if;
 if paid_amount is null or paid_amount<=0 then raise exception 'পরিশোধের পরিমাণ সঠিক নয়'; end if;
 select * into d from public.chanda_dues where id=target_due for update;
 if not found then raise exception 'মাসিক চাঁদার হিসাব পাওয়া যায়নি'; end if;
 select * into m from public.chanda_members where id=d.member_id;
 if d.status='paid' or d.paid_amount+record_chanda_payment.paid_amount>d.amount then raise exception 'পরিশোধের পরিমাণ বকেয়ার চেয়ে বেশি'; end if;
 if method not in ('cash','bank','bkash','nagad','other') then raise exception 'পেমেন্ট পদ্ধতি সঠিক নয়'; end if;
 insert into public.chanda_payments(due_id,member_id,amount,payment_date,payment_method,reference_no,note,received_by)
 values(d.id,m.id,record_chanda_payment.paid_amount,paid_on,method,coalesce(reference,''),coalesce(memo,''),auth.uid()) returning id into payment_id;
 update public.chanda_dues set paid_amount=chanda_dues.paid_amount+record_chanda_payment.paid_amount,
 status=case when chanda_dues.paid_amount+record_chanda_payment.paid_amount>=chanda_dues.amount then 'paid' else 'partial' end,
 paid_at=case when chanda_dues.paid_amount+record_chanda_payment.paid_amount>=chanda_dues.amount then now() else null end where id=d.id;
 insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category)
 values('mosque','income',paid_on,'মাসিক চাঁদা',record_chanda_payment.paid_amount,m.member_name,
 case when method in ('bkash','nagad') then 'mobile_banking' when method in ('cash','bank') then method else 'other' end,
 coalesce(reference,''),'মাসিক চাঁদা: '||to_char(d.due_month,'YYYY-MM')||' · payment id '||payment_id,'pending',auth.uid(),'general');
 return payment_id;
end;$$;
revoke all on function public.record_chanda_payment(uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.record_chanda_payment(uuid,numeric,date,text,text,text) to authenticated;

create or replace function public.create_current_chanda_due()
returns trigger language plpgsql security definer set search_path=public as $$
declare ms date := date_trunc('month',(now() at time zone 'Asia/Dhaka'))::date;
begin
 insert into public.chanda_dues(member_id,due_month,due_date,amount)
 values(new.id,ms,make_date(extract(year from ms)::int,extract(month from ms)::int,
 least(new.due_day,extract(day from (ms+interval '1 month - 1 day'))::int)),new.monthly_amount)
 on conflict(member_id,due_month) do nothing; return new;
end;$$;
revoke all on function public.create_current_chanda_due() from public,anon,authenticated;
drop trigger if exists chanda_member_initial_due on public.chanda_members;
create trigger chanda_member_initial_due after insert on public.chanda_members for each row when(new.status='active') execute function public.create_current_chanda_due();

create or replace function public.run_chanda_daily_jobs()
returns jsonb language plpgsql security definer set search_path=public as $$
declare generated_count integer:=0; queued_count integer:=0;
 today_dhaka date:=(now() at time zone 'Asia/Dhaka')::date;
 month_start date:=date_trunc('month',(now() at time zone 'Asia/Dhaka'))::date;
begin
 insert into public.chanda_dues(member_id,due_month,due_date,amount)
 select m.id,month_start,make_date(extract(year from month_start)::int,extract(month from month_start)::int,
 least(m.due_day,extract(day from (month_start+interval '1 month - 1 day'))::int)),m.monthly_amount
 from public.chanda_members m where m.status='active' on conflict(member_id,due_month) do nothing;
 get diagnostics generated_count=row_count;
 insert into public.chanda_message_logs(member_id,due_id,channel,destination,message,status)
 select m.id,d.id,'in_app',coalesce(m.phone,''),
 'আপনার '||to_char(d.due_month,'YYYY-MM')||' মাসের মাসিক চাঁদা '||to_char(d.amount-d.paid_amount,'FM999999990.00')||' টাকা বকেয়া রয়েছে। অনুগ্রহ করে পরিশোধ করুন।','queued'
 from public.chanda_dues d join public.chanda_members m on m.id=d.member_id
 where m.status='active' and d.status<>'paid' and d.due_date<=today_dhaka
 and not exists(select 1 from public.chanda_message_logs l where l.due_id=d.id and l.channel='in_app')
 on conflict(due_id,channel) do nothing;
 get diagnostics queued_count=row_count;
 return jsonb_build_object('generated_dues',generated_count,'queued_in_app_reminders',queued_count,'run_date',today_dhaka);
end;$$;
revoke all on function public.run_chanda_daily_jobs() from public,anon,authenticated;
grant execute on function public.run_chanda_daily_jobs() to service_role;
do $$ begin
 if exists(select 1 from cron.job where jobname='chanda-daily-reminder-queue') then
  perform cron.unschedule(jobid) from cron.job where jobname='chanda-daily-reminder-queue';
 end if;
 perform cron.schedule('chanda-daily-reminder-queue','15 0 * * *','select public.run_chanda_daily_jobs();');
end $$;
select public.run_chanda_daily_jobs();

-- Chanda RPCs are signed-in-only; the due-creation function is trigger-only.
revoke all on function public.chanda_can_access(boolean) from public,anon;
grant execute on function public.chanda_can_access(boolean) to authenticated;
revoke all on function public.record_chanda_payment(uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.record_chanda_payment(uuid,numeric,date,text,text,text) to authenticated;
revoke all on function public.create_current_chanda_due() from public,anon,authenticated;
create index if not exists chanda_members_created_by_idx on public.chanda_members(created_by);
create index if not exists chanda_message_logs_member_id_idx on public.chanda_message_logs(member_id);
create index if not exists chanda_payments_due_id_idx on public.chanda_payments(due_id);
create index if not exists chanda_payments_received_by_idx on public.chanda_payments(received_by);
drop policy if exists "chanda members insert authorized" on public.chanda_members;
create policy "chanda members insert authorized" on public.chanda_members
 for insert to authenticated with check(public.chanda_can_access(true) and created_by=(select auth.uid()));
