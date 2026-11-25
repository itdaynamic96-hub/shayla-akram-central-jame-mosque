-- Map the asset register to the Balance Sheet module, not Fund Management.
drop policy if exists accounts_detail_assets_read on public.account_assets;
drop policy if exists accounts_detail_assets_insert on public.account_assets;
drop policy if exists accounts_detail_assets_update on public.account_assets;
create policy accounts_detail_assets_read on public.account_assets
for select to authenticated using(public.accounts_feature_access(institution,'m76',false));
create policy accounts_detail_assets_insert on public.account_assets
for insert to authenticated with check(public.accounts_feature_access(institution,'m76',true) and created_by=(select auth.uid()));
create policy accounts_detail_assets_update on public.account_assets
for update to authenticated using(public.accounts_feature_access(institution,'m76',true))
with check(public.accounts_feature_access(institution,'m76',true));
drop policy if exists accounts_detail_assets_audit_read on public.audit_logs;
create policy accounts_detail_assets_audit_read on public.audit_logs
for select to authenticated using(
 table_name='account_assets'
 and public.accounts_feature_access(
   coalesce(after_data->>'institution',before_data->>'institution','mosque'),
   'm76',false
 )
);
