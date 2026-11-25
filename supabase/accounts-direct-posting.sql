drop policy if exists accounts_detail_insert on public.ledger_entries;
create policy accounts_detail_insert
on public.ledger_entries
for insert to authenticated
with check (
  status='approved'
  and created_by=(select auth.uid())
  and approved_by=(select auth.uid())
  and approved_at is not null
  and (
    (entry_type='income' and fund_category not in ('general','zakat','sadaqah') and accounts_feature_access(institution,'m63',true)
      and (has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) or account_module_permission(institution,array['m63','m80'],true,true)))
    or
    (entry_type='income' and fund_category='general' and accounts_feature_access(institution,'m65',true)
      and (has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) or account_module_permission(institution,array['m65','m80'],true,true)))
    or
    (entry_type='expense' and fund_category not in ('zakat','sadaqah') and accounts_feature_access(institution,'m64',true)
      and (has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) or account_module_permission(institution,array['m64','m80'],true,true)))
    or
    (fund_category in ('zakat','sadaqah') and accounts_feature_access(institution,'m72',true)
      and (has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution) or account_module_permission(institution,array['m72','m80'],true,true)))
  )
);

drop policy if exists accounts_detail_insert_pending on public.ledger_entries;
create policy accounts_detail_insert_pending
on public.ledger_entries
for insert to authenticated
with check (
  status='pending'
  and created_by=(select auth.uid())
  and approved_by is null
  and approved_at is null
  and (
    (entry_type='income' and fund_category not in ('general','zakat','sadaqah') and accounts_feature_access(institution,'m63',true))
    or (entry_type='income' and fund_category='general' and accounts_feature_access(institution,'m65',true))
    or (entry_type='expense' and fund_category not in ('zakat','sadaqah') and accounts_feature_access(institution,'m64',true))
    or (fund_category in ('zakat','sadaqah') and accounts_feature_access(institution,'m72',true))
  )
);

drop policy if exists accounts_detail_approve on public.ledger_entries;
create policy accounts_detail_approve
on public.ledger_entries
for update to authenticated
using (status='pending' and account_module_permission(institution,array['m63','m64','m65','m70','m72','m80'],true,true))
with check (status in ('approved','rejected') and approved_by=(select auth.uid()) and approved_at is not null
  and account_module_permission(institution,array['m63','m64','m65','m70','m72','m80'],true,true));

drop policy if exists accounts_detail_ledger_approve on public.ledger_entries;
create policy accounts_detail_ledger_approve
on public.ledger_entries
for update to authenticated
using (status='pending' and has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check (status in ('approved','rejected') and approved_by=(select auth.uid()) and approved_at is not null
  and has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));
