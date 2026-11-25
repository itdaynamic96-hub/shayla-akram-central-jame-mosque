-- Enforce view/write/approve capability flags for custom Accounts operators.
-- Keeps the approved single-operator model: a module assignee can approve their
-- own module's work only when that module explicitly has can_approve=true.

create or replace function public.accounts_feature_access(
  target_institution text,
  target_module text,
  write_access boolean default false
) returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.institution = 'both' or p.institution = target_institution)
      and (
        p.role = 'super_admin'
        or p.role in ('admin','accounts_manager','accountant','mosque_admin','foundation_admin')
        or (not write_access and p.role = 'auditor')
        or (
          p.role = 'custom_admin'
          and exists (
            select 1
            from public.admin_module_permissions amp
            where amp.user_id = (select auth.uid())
              and amp.module_key = target_module
              and amp.can_view
              and (not write_access or amp.can_write)
          )
        )
      )
      and (p.role <> 'mosque_admin' or target_institution = 'mosque')
      and (p.role <> 'foundation_admin' or target_institution = 'foundation')
  );
$$;
revoke all on function public.accounts_feature_access(text,text,boolean) from public, anon;
grant execute on function public.accounts_feature_access(text,text,boolean) to authenticated;

create or replace function public.account_module_permission(
  target_institution text,
  target_modules text[],
  write_access boolean default false,
  approve_access boolean default false
) returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.admin_module_permissions mp on mp.user_id = p.id
    where p.id = (select auth.uid())
      and p.role = 'custom_admin'
      and (p.institution = 'both' or p.institution = target_institution)
      and mp.module_key = any(target_modules)
      and mp.can_view
      and (not write_access or mp.can_write)
      and (not approve_access or mp.can_approve)
  );
$$;
revoke all on function public.account_module_permission(text,text[],boolean,boolean) from public, anon;
grant execute on function public.account_module_permission(text,text[],boolean,boolean) to authenticated;

-- Keep payroll approval aligned with its own module (m70); m80 remains the
-- central approval module and can also authorize approvals when explicitly granted.
drop policy if exists accounts_detail_payroll_approve on public.payroll_records;
create policy accounts_detail_payroll_approve
on public.payroll_records
for update to authenticated
using (
  status = 'pending'
  and (
    public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution)
    or public.account_module_permission(institution, array['m70','m80'], true, true)
  )
)
with check (
  status = 'approved'
  and (
    public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], institution)
    or public.account_module_permission(institution, array['m70','m80'], true, true)
  )
);

create or replace function public.guard_payroll_record_changes()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  l public.ledger_entries%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Payroll history cannot be deleted';
  end if;
  if old.status in ('paid','rejected') then
    raise exception 'Finalized payroll records are immutable';
  end if;
  if new.institution <> old.institution
    or new.staff_id <> old.staff_id
    or new.payroll_month <> old.payroll_month
    or new.base_salary <> old.base_salary
    or new.bonus <> old.bonus
    or new.deductions <> old.deductions
    or new.created_by <> old.created_by then
    raise exception 'Payroll financial details cannot be changed after creation';
  end if;
  if old.status = 'pending' and new.status not in ('pending','approved','rejected') then
    raise exception 'Invalid payroll status transition';
  end if;
  if old.status = 'approved' and new.status <> 'paid' then
    raise exception 'Approved payroll can only move to paid';
  end if;
  if new.status in ('approved','rejected') then
    if not (
      public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'], old.institution)
      or public.account_module_permission(old.institution, array['m70','m80'], true, true)
    ) then
      raise exception 'Payroll approval permission required';
    end if;
    if new.approved_by is distinct from auth.uid() or new.approved_at is null then
      raise exception 'Payroll approval identity and timestamp are required';
    end if;
  end if;
  if new.status = 'paid' then
    if new.ledger_entry_id is null then
      raise exception 'A ledger entry is required before marking payroll paid';
    end if;
    select * into l from public.ledger_entries where id = new.ledger_entry_id;
    if not found
      or l.institution <> new.institution
      or l.entry_type <> 'expense'
      or l.amount <> new.net_amount
      or l.category <> 'ইমাম ও কর্মচারীদের বেতন'
      or position(new.id::text in l.note) = 0 then
      raise exception 'The linked ledger entry does not match this payroll record';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_payroll_record_changes() from public, anon, authenticated;

create or replace function public.account_decide_request(
  p_request uuid,
  p_decision text,
  p_note text default ''
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  r public.account_approval_requests%rowtype;
  reqdata jsonb;
  journal uuid;
  jno bigint;
  line jsonb;
  a public.account_bank_accounts%rowtype;
  b public.account_bank_accounts%rowtype;
  profile_role text;
  profile_inst text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;
  select * into r from public.account_approval_requests where id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'Request not found or already decided'; end if;
  select role,institution into profile_role,profile_inst from public.profiles where id = auth.uid();
  if profile_role is null or profile_inst is null then raise exception 'Approver profile not found'; end if;
  if profile_role = 'custom_admin' then
    if not exists (
      select 1 from public.admin_module_permissions p
      where p.user_id = auth.uid()
        and p.module_key = 'm80'
        and p.can_view and p.can_write and p.can_approve
    ) then
      raise exception 'Approval module requires view, write and approve permissions';
    end if;
  elsif profile_role not in ('super_admin','accounts_manager','mosque_admin','foundation_admin') then
    raise exception 'Approver role required';
  end if;
  if profile_inst not in ('both',r.institution) then raise exception 'Institution mismatch'; end if;
  if (profile_role = 'mosque_admin' and r.institution <> 'mosque')
    or (profile_role = 'foundation_admin' and r.institution <> 'foundation') then
    raise exception 'Institution mismatch';
  end if;
  if p_decision = 'rejected' then
    update public.account_approval_requests
    set status='rejected',approved_by=auth.uid(),approved_at=now(),decision_note=coalesce(p_note,'')
    where id=r.id;
    return null;
  end if;
  reqdata := r.request_data;
  perform pg_advisory_xact_lock(hashtext('account_journal_no_' || r.institution));
  select coalesce(max(journal_no),0)+1 into jno
  from public.account_journal_entries where institution=r.institution;
  if r.request_type = 'manual_journal' then
    insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
    values(r.institution,jno,(reqdata->>'journal_date')::date,reqdata->>'description','manual',r.id,'posted',r.created_by)
    returning id into journal;
    for line in select * from jsonb_array_elements(reqdata->'lines') loop
      insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
      values(journal,r.institution,line->>'account_code',coalesce(line->>'description',''),coalesce((line->>'debit')::numeric,0),coalesce((line->>'credit')::numeric,0));
    end loop;
  elsif r.request_type = 'bank_transfer' then
    select * into a from public.account_bank_accounts
    where id=(reqdata->>'from_id')::uuid and institution=r.institution and is_active;
    select * into b from public.account_bank_accounts
    where id=(reqdata->>'to_id')::uuid and institution=r.institution and is_active;
    if a.id is null or b.id is null then raise exception 'Transfer account is inactive or missing'; end if;
    insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
    values(r.institution,jno,(reqdata->>'transfer_date')::date,coalesce(reqdata->>'description','Account transfer'),'transfer',r.id,'posted',r.created_by)
    returning id into journal;
    insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
    values(journal,r.institution,b.account_code,'Transfer received',(reqdata->>'amount')::numeric,0),
          (journal,r.institution,a.account_code,'Transfer sent',0,(reqdata->>'amount')::numeric);
  else
    raise exception 'Unsupported request type';
  end if;
  update public.account_approval_requests
  set status='approved',approved_by=auth.uid(),approved_at=now(),decision_note=coalesce(p_note,''),journal_id=journal
  where id=r.id;
  return journal;
end;
$function$;
revoke all on function public.account_decide_request(uuid,text,text) from public, anon;
grant execute on function public.account_decide_request(uuid,text,text) to authenticated;
