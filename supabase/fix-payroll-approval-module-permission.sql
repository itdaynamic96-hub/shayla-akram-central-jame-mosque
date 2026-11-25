-- Align Payroll approval authorization with the UI's Approval Management module.
-- The payroll UI checks m80.can_approve for custom admins; the old trigger
-- checked m43, causing the UI to show an approval button that always failed.
CREATE OR REPLACE FUNCTION public.guard_payroll_record_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare l public.ledger_entries%rowtype;
begin
 if tg_op='DELETE' then raise exception 'Payroll history cannot be deleted'; end if;
 if old.status in ('paid','rejected') then raise exception 'Finalized payroll records are immutable'; end if;
 if new.institution<>old.institution or new.staff_id<>old.staff_id or new.payroll_month<>old.payroll_month
    or new.base_salary<>old.base_salary or new.bonus<>old.bonus or new.deductions<>old.deductions
    or new.created_by<>old.created_by then raise exception 'Payroll financial details cannot be changed after creation'; end if;
 if old.status='pending' and new.status not in ('pending','approved','rejected') then raise exception 'Invalid payroll status transition'; end if;
 if old.status='approved' and new.status<>'paid' then raise exception 'Approved payroll can only move to paid'; end if;
 if new.status in ('approved','rejected') then
   if not (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],old.institution)
       or public.account_module_permission(old.institution,array['m80'],true,true)) then
     raise exception 'Payroll approval permission required';
   end if;
   if new.approved_by is distinct from auth.uid() or new.approved_at is null then raise exception 'Payroll approval identity and timestamp are required'; end if;
 end if;
 if new.status='paid' then
   if new.ledger_entry_id is null then raise exception 'A ledger entry is required before marking payroll paid'; end if;
   select * into l from public.ledger_entries where id=new.ledger_entry_id;
   if not found or l.institution<>new.institution or l.entry_type<>'expense' or l.amount<>new.net_amount
      or l.category<>'ইমাম ও কর্মচারীদের বেতন' or position(new.id::text in l.note)=0 then
     raise exception 'The linked ledger entry does not match this payroll record';
   end if;
 end if;
 return new;
end;
$function$;
