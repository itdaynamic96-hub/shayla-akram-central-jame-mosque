drop policy if exists accounts_detail_payroll_update on public.payroll_records;
drop policy if exists accounts_detail_payroll_approve on public.payroll_records;
create policy accounts_detail_payroll_update on public.payroll_records
for update to authenticated using (status='pending' and accounts_feature_access(institution,'m70',true))
with check (status='pending' and accounts_feature_access(institution,'m70',true));
create policy accounts_detail_payroll_approve on public.payroll_records
for update to authenticated using (
 status='pending' and (
  has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
  or account_module_permission(institution,array['m80'],true,true)
 )
) with check (
 status='approved' and (
  has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
  or account_module_permission(institution,array['m80'],true,true)
 )
);