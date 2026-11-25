create or replace function public.record_chanda_payment(
 target_due uuid,
 paid_amount numeric,
 paid_on date default (now() at time zone 'Asia/Dhaka')::date,
 method text default 'cash',
 reference text default '',
 memo text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
 d public.chanda_dues%rowtype;
 m public.chanda_members%rowtype;
 payment_id uuid;
 ledger_reference text;
begin
 if auth.uid() is null or not public.chanda_can_access(true) then
   raise exception 'অনুমতি নেই';
 end if;
 if paid_amount is null or paid_amount<=0 or paid_on is null then
   raise exception 'পরিশোধের পরিমাণ বা তারিখ সঠিক নয়';
 end if;
 select * into d from public.chanda_dues where id=target_due for update;
 if not found then raise exception 'মাসিক চাঁদার হিসাব পাওয়া যায়নি'; end if;
 select * into m from public.chanda_members where id=d.member_id;
 if not found then raise exception 'চাঁদাদাতার তথ্য পাওয়া যায়নি'; end if;
 if d.status='paid' or d.paid_amount+record_chanda_payment.paid_amount>d.amount then
   raise exception 'পরিশোধের পরিমাণ বকেয়ার চেয়ে বেশি';
 end if;
 if method not in ('cash','bank','bkash','nagad','other') then
   raise exception 'পেমেন্ট পদ্ধতি সঠিক নয়';
 end if;
 insert into public.chanda_payments(due_id,member_id,amount,payment_date,payment_method,reference_no,note,received_by)
 values(d.id,m.id,paid_amount,paid_on,method,coalesce(reference,''),coalesce(memo,''),auth.uid())
 returning id into payment_id;
 update public.chanda_dues as cd
 set paid_amount=cd.paid_amount+record_chanda_payment.paid_amount,
     status=case when cd.paid_amount+record_chanda_payment.paid_amount>=cd.amount then 'paid' else 'partial' end,
     paid_at=case when cd.paid_amount+record_chanda_payment.paid_amount>=cd.amount then now() else null end
 where cd.id=d.id;
 ledger_reference:=coalesce(nullif(trim(reference),''),'CHANDA')||'-'||left(replace(payment_id::text,'-',''),12);
 insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category)
 values('mosque','income',paid_on,'মাসিক চাঁদা',paid_amount,m.member_name,
   case when method in ('bkash','nagad') then 'mobile_banking' when method in ('cash','bank') then method else 'other' end,
   ledger_reference,'মাসিক চাঁদা: '||to_char(d.due_month,'YYYY-MM')||' · payment id '||payment_id,'pending',auth.uid(),'general');
 return payment_id;
end;
$function$;
revoke all on function public.record_chanda_payment(uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.record_chanda_payment(uuid,numeric,date,text,text,text) to authenticated;
