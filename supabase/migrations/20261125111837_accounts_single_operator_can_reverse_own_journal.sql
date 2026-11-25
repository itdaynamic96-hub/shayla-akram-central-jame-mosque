-- The assigned Accounts operator may reverse a journal they created.
-- The reversal is still linked to the original and written as a separate journal.
create or replace function public.account_reverse_journal(p_journal uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  j public.account_journal_entries%rowtype;
  new_journal uuid;
  jno bigint;
  actor_role text;
  actor_inst text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into j from public.account_journal_entries where id=p_journal for update;
  if not found or j.status<>'posted' then raise exception 'Posted journal not found'; end if;
  select role,institution into actor_role,actor_inst from public.profiles where id=auth.uid();
  if actor_role is null or actor_inst is null then raise exception 'Profile not found'; end if;
  if actor_inst not in ('both',j.institution) then raise exception 'Institution mismatch'; end if;
  if actor_role='custom_admin' then
    if not exists(
      select 1 from public.admin_module_permissions p
      where p.user_id=auth.uid() and p.module_key='m80'
        and p.can_view and p.can_write and p.can_approve
    ) then raise exception 'Approval permission required'; end if;
  elsif actor_role not in ('super_admin','accounts_manager','mosque_admin','foundation_admin') then
    raise exception 'Approver role required';
  end if;
  if (actor_role='mosque_admin' and j.institution<>'mosque')
     or (actor_role='foundation_admin' and j.institution<>'foundation') then
    raise exception 'Institution mismatch';
  end if;

  -- Single assigned-operator model: the same authorized worker may reverse
  -- a journal they created; the reversal remains a separate, linked journal entry.
  perform pg_advisory_xact_lock(hashtext('account_journal_no_'||j.institution));
  select coalesce(max(journal_no),0)+1 into jno
    from public.account_journal_entries where institution=j.institution;
  insert into public.account_journal_entries(
    institution,journal_no,journal_date,description,source_type,source_id,status,created_by
  )
  values(
    j.institution,jno,current_date,
    'Reversal of journal #'||j.journal_no||': '||coalesce(p_reason,''),
    'adjustment',j.id,'posted',auth.uid()
  ) returning id into new_journal;
  insert into public.account_journal_lines(
    journal_id,institution,account_code,description,debit,credit
  )
  select new_journal,institution,account_code,
    'Reversal: '||coalesce(p_reason,''),credit,debit
  from public.account_journal_lines where journal_id=j.id;
  update public.account_journal_entries set status='reversed' where id=j.id;
  return new_journal;
end;
$function$;
