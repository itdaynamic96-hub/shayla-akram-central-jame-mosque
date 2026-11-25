-- Record one collection across one or more selected monthly chanda dues.
-- Amount is allocated oldest selected month first; the RPC is atomic.
create or replace function public.record_chanda_payment_months(
 target_dues uuid[], paid_amount numeric,
 paid_on date default (now() at time zone 'Asia/Dhaka')::date,
 method text default 'cash', reference text default '', memo text default ''
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
 d public.chanda_dues%rowtype;
 remaining_payment numeric(12,2);
 due_left numeric(12,2);
 allocation numeric(12,2);
 payment_ids uuid[] := array[]::uuid[];
 selected_member uuid;
 due_count integer := 0;
begin
 if auth.uid() is null or not public.chanda_can_access(true) then raise exception 'অনুমতি নেই'; end if;
 if target_dues is null or cardinality(target_dues)=0 then raise exception 'কমপক্ষে একটি মাস নির্বাচন করুন'; end if;
 if paid_amount is null or paid_amount<=0 then raise exception 'জমার পরিমাণ সঠিক নয়'; end if;
 if method not in ('cash','bank','bkash','nagad','other') then raise exception 'পেমেন্ট পদ্ধতি সঠিক নয়'; end if;
 if cardinality(target_dues)<>(select count(distinct x) from unnest(target_dues) x) then raise exception 'একই মাস একাধিকবার নির্বাচন করা হয়েছে'; end if;
 select count(*), (array_agg(member_id))[1] into due_count, selected_member
 from public.chanda_dues where id=any(target_dues);
 if due_count<>cardinality(target_dues) then raise exception 'নির্বাচিত মাসের কোনো হিসাব পাওয়া যায়নি'; end if;
 if exists(select 1 from public.chanda_dues where id=any(target_dues) and member_id<>selected_member) then raise exception 'একাধিক সদস্যের মাস একসাথে নির্বাচন করা যাবে না'; end if;
 select coalesce(sum(amount-paid_amount),0) into due_left from public.chanda_dues where id=any(target_dues);
 if paid_amount>due_left then raise exception 'জমার পরিমাণ নির্বাচিত মাসগুলোর মোট বকেয়ার চেয়ে বেশি'; end if;
 remaining_payment:=paid_amount;
 for d in select * from public.chanda_dues where id=any(target_dues) order by due_month for update loop
   exit when remaining_payment<=0;
   allocation:=least(remaining_payment,d.amount-d.paid_amount);
   if allocation>0 then
     payment_ids:=array_append(payment_ids,public.record_chanda_payment(d.id,allocation,paid_on,method,coalesce(reference,''),coalesce(memo,'')));
     remaining_payment:=remaining_payment-allocation;
   end if;
 end loop;
 return jsonb_build_object('payment_ids',payment_ids,'allocated_amount',paid_amount,'member_id',selected_member,'months_count',cardinality(target_dues));
end;
$$;
revoke all on function public.record_chanda_payment_months(uuid[],numeric,date,text,text,text) from public,anon;
grant execute on function public.record_chanda_payment_months(uuid[],numeric,date,text,text,text) to authenticated;
