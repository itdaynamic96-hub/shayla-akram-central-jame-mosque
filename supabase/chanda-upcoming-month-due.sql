-- Pre-create next month's dues so the 20th-24th and 25th+ status window is visible.
create or replace function public.run_chanda_daily_jobs()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 generated_count integer:=0;
 upcoming_count integer:=0;
 queued_count integer:=0;
 today_dhaka date:=(now() at time zone 'Asia/Dhaka')::date;
 month_start date:=date_trunc('month',(now() at time zone 'Asia/Dhaka'))::date;
 next_month_start date:=(date_trunc('month',(now() at time zone 'Asia/Dhaka'))+interval '1 month')::date;
begin
 insert into public.chanda_dues(member_id,due_month,due_date,amount)
 select m.id,month_start,make_date(extract(year from month_start)::int,extract(month from month_start)::int,
 least(m.due_day,extract(day from (month_start+interval '1 month - 1 day'))::int)),m.monthly_amount
 from public.chanda_members m where m.status='active'
 on conflict(member_id,due_month) do nothing;
 get diagnostics generated_count=row_count;

 insert into public.chanda_dues(member_id,due_month,due_date,amount)
 select m.id,next_month_start,next_month_start,m.monthly_amount
 from public.chanda_members m where m.status='active'
 on conflict(member_id,due_month) do nothing;
 get diagnostics upcoming_count=row_count;

 insert into public.chanda_message_logs(member_id,due_id,channel,destination,message,status)
 select m.id,d.id,'in_app',coalesce(m.phone,''),
 'আপনার '||to_char(d.due_month,'YYYY-MM')||' মাসের মাসিক চাঁদা '||to_char(d.amount-d.paid_amount,'FM999999990.00')||' টাকা বকেয়া রয়েছে। অনুগ্রহ করে পরিশোধ করুন।','queued'
 from public.chanda_dues d join public.chanda_members m on m.id=d.member_id
 where m.status='active' and d.status<>'paid' and d.due_date<=today_dhaka
 and not exists(select 1 from public.chanda_message_logs l where l.due_id=d.id and l.channel='in_app')
 on conflict(due_id,channel) do nothing;
 get diagnostics queued_count=row_count;
 return jsonb_build_object('generated_current_dues',generated_count,'generated_upcoming_dues',upcoming_count,'queued_in_app_reminders',queued_count,'run_date',today_dhaka);
end;$$;
revoke all on function public.run_chanda_daily_jobs() from public,anon,authenticated;
grant execute on function public.run_chanda_daily_jobs() to service_role;
select public.run_chanda_daily_jobs();
