create or replace function public.ensure_chanda_dues_for_month(target_month date)
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$
declare inserted_count integer := 0;
begin
 if auth.uid() is null or not public.chanda_can_access(true) then
  raise exception 'মাসিক চাঁদার পাওনা তৈরির অনুমতি নেই';
 end if;
 if target_month is null or extract(day from target_month) <> 1 then
  raise exception 'মাসের প্রথম তারিখ দিতে হবে';
 end if;
 insert into public.chanda_dues(member_id,due_month,due_date,amount)
 select m.id,target_month,target_month,m.monthly_amount
 from public.chanda_members m
 where m.institution='mosque' and m.status='active'
 on conflict(member_id,due_month) do nothing;
 get diagnostics inserted_count = row_count;
 return inserted_count;
end;
$$;
revoke all on function public.ensure_chanda_dues_for_month(date) from public,anon;
grant execute on function public.ensure_chanda_dues_for_month(date) to authenticated;
