create or replace function public.mark_payroll_paid_months_with_method(
 target_payrolls uuid[], paid_on date, paid_via text,
 payment_reference text default '', selected_payment_method uuid default null
)
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 first_payroll public.payroll_records%rowtype;
 p public.payroll_records%rowtype;
 s public.account_staff%rowtype;
 pm public.account_payment_methods%rowtype;
 new_ledger_id uuid;
 paid_count integer := 0;
 requested_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if target_payrolls is null or cardinality(target_payrolls)<1 or cardinality(target_payrolls)>24 then
  raise exception 'Select between 1 and 24 salary months';
 end if;
 select count(distinct x) into requested_count from unnest(target_payrolls) as x;
 if requested_count<>cardinality(target_payrolls) then raise exception 'Duplicate payroll month selected'; end if;
 if paid_via not in('cash','bank','mobile_banking','other') then raise exception 'Invalid payment method'; end if;
 select * into first_payroll from public.payroll_records where id=target_payrolls[1] for update;
 if not found then raise exception 'Payroll record not found'; end if;
 if not public.accounts_feature_access(first_payroll.institution,'m70',true) then raise exception 'Not authorized'; end if;
 if selected_payment_method is not null then
  if not public.accounts_feature_access(first_payroll.institution,'m66',false) then raise exception 'Payment method details are restricted to Accounts users'; end if;
  select * into pm from public.account_payment_methods where id=selected_payment_method and institution=first_payroll.institution and is_active=true;
  if not found then raise exception 'Selected payment destination is unavailable'; end if;
 end if;
 select * into s from public.account_staff where id=first_payroll.staff_id and institution=first_payroll.institution;
 if not found then raise exception 'Staff member not found'; end if;
 for p in select * from public.payroll_records where id=any(target_payrolls) order by payroll_month for update loop
  if p.institution<>first_payroll.institution or p.staff_id<>first_payroll.staff_id then raise exception 'Select salary months for one employee and one institution only'; end if;
  if not public.accounts_feature_access(p.institution,'m70',true) then raise exception 'Not authorized'; end if;
  if p.status<>'approved' then raise exception 'Only approved salary months can be paid: %',p.payroll_month; end if;
  if p.ledger_entry_id is not null then raise exception 'Salary already has a ledger entry: %',p.payroll_month; end if;
  insert into public.ledger_entries(institution,entry_type,entry_date,category,amount,payer_or_payee,payment_method,reference_no,note,status,created_by,fund_category,payment_method_id)
  values(p.institution,'expense',coalesce(paid_on,current_date),'ইমাম ও কর্মচারীদের বেতন',p.net_amount,s.full_name,paid_via,coalesce(payment_reference,''),'Payroll month: '||p.payroll_month||' · payroll id: '||p.id::text,'pending',auth.uid(),'general',selected_payment_method)
  returning id into new_ledger_id;
  update public.payroll_records set status='paid',payment_date=coalesce(paid_on,current_date),payment_method=paid_via,reference_no=coalesce(payment_reference,''),ledger_entry_id=new_ledger_id,payment_method_id=selected_payment_method where id=p.id;
  paid_count:=paid_count+1;
 end loop;
 if paid_count<>requested_count then raise exception 'One or more selected payroll records were not found'; end if;
 return paid_count;
end;
$$;
revoke all on function public.mark_payroll_paid_months_with_method(uuid[],date,text,text,uuid) from public,anon;
grant execute on function public.mark_payroll_paid_months_with_method(uuid[],date,text,text,uuid) to authenticated;