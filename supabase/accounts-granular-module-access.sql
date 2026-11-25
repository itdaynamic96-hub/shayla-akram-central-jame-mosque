-- SAKM-61 detailed Accounts permissions (m62-m85)
-- Existing m01-m61 website permissions remain unchanged.

alter table public.admin_module_permissions
  drop constraint if exists admin_module_permissions_module_key_check;
alter table public.admin_module_permissions
  add constraint admin_module_permissions_module_key_check
  check (module_key ~ '^m(0[1-9]|[1-7][0-9]|8[0-5])$');

alter table public.module_records
  drop constraint if exists module_records_module_key_check;
alter table public.module_records
  add constraint module_records_module_key_check
  check (module_key ~ '^m(0[1-9]|[1-7][0-9]|8[0-5])$');

do $$
declare d text;
begin
 select pg_get_functiondef('public.replace_admin_module_permissions(uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'jsonb_array_length(permission_rows) > 61','jsonb_array_length(permission_rows) > 85');
 execute d;

 select pg_get_functiondef('public.accounts_message_access(text,boolean)'::regprocedure) into d;
 d:=replace(d,'mp.module_key between ''m41'' and ''m50''','mp.module_key = ''m84''');
 execute d;

 select pg_get_functiondef('public.chanda_can_access(boolean)'::regprocedure) into d;
 d:=replace(d,'''m51''','''m85''');
 execute d;

 select pg_get_functiondef('public.account_create_bank_account(text,text,text,text,text,numeric)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m66'''); execute d;

 select pg_get_functiondef('public.account_submit_bank_transfer(text,uuid,uuid,numeric,date,text)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m67'''); execute d;

 select pg_get_functiondef('public.account_submit_manual_journal(text,date,text,jsonb)'::regprocedure) into d;
 d:=replace(d,'''m50''','''m68'''); execute d;

 select pg_get_functiondef('public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m78'''); execute d;

 select pg_get_functiondef('public.account_bank_reconciliation_candidates(uuid,date)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m78'''); execute d;

 select pg_get_functiondef('public.account_create_bank_reconciliation(text,uuid,date,numeric,numeric,text)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m78'''); execute d;

 select pg_get_functiondef('public.account_create_reconciliation(uuid,date,numeric,numeric,text)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m78'''); execute d;

 select pg_get_functiondef('public.account_reconcile_bank(uuid,text)'::regprocedure) into d;
 d:=replace(d,'''m46''','''m78'''); execute d;

 select pg_get_functiondef('public.account_decide_request(uuid,text,text)'::regprocedure) into d;
 d:=replace(d,'p.module_key=''m50''','p.module_key=''m80'''); execute d;

 select pg_get_functiondef('public.account_reverse_journal(uuid,text)'::regprocedure) into d;
 d:=replace(d,'p.module_key=''m50''','p.module_key=''m79'''); execute d;

 select pg_get_functiondef('public.module_record_access(text,text,boolean)'::regprocedure) into d;
 d:=replace(d,
   'or (target_key=''m61'' and p.role in (''admin'',''mosque_admin'',''manager'')',
   'or (substring(target_key from 2)::integer between 62 and 84 and p.role in (''admin'',''accounts_manager'',''accountant'',''mosque_admin'',''foundation_admin'') and (p.institution=''both'' or p.institution=target_institution) and target_institution in (''mosque'',''foundation''))\n    or (target_key=''m85'' and p.role in (''admin'',''mosque_admin'',''accounts_manager'',''accountant'') and p.institution in (''both'',''mosque'') and target_institution=''mosque'')\n    or (target_key=''m61'' and p.role in (''admin'',''mosque_admin'',''manager'')');
 execute d;

 select pg_get_functiondef('public.module_record_approval_access(text,text)'::regprocedure) into d;
 d:=replace(d,
   'or (target_key=''m61'' and p.role in (''admin'',''mosque_admin'')',
   'or (substring(target_key from 2)::integer between 62 and 84 and p.role in (''admin'',''accounts_manager'') and (p.institution=''both'' or p.institution=target_institution) and target_institution in (''mosque'',''foundation''))\n    or (target_key=''m85'' and p.role in (''admin'',''mosque_admin'',''accounts_manager'') and p.institution in (''both'',''mosque'') and target_institution=''mosque'')\n    or (target_key=''m61'' and p.role in (''admin'',''mosque_admin'')');
 execute d;
end $$;

-- Fine-grained access to ledger entries. Existing legacy policies remain for existing roles.
drop policy if exists accounts_detail_read on public.ledger_entries;
create policy accounts_detail_read on public.ledger_entries for select to authenticated using (
  accounts_feature_access(institution,'m62',false)
  or (entry_type='income' and accounts_feature_access(institution,'m63',false))
  or (entry_type='expense' and accounts_feature_access(institution,'m64',false))
  or accounts_feature_access(institution,'m65',false)
  or accounts_feature_access(institution,'m68',false)
  or accounts_feature_access(institution,'m69',false)
  or accounts_feature_access(institution,'m70',false)
  or accounts_feature_access(institution,'m71',false)
  or accounts_feature_access(institution,'m72',false)
  or accounts_feature_access(institution,'m73',false)
  or accounts_feature_access(institution,'m74',false)
  or accounts_feature_access(institution,'m75',false)
  or accounts_feature_access(institution,'m76',false)
  or accounts_feature_access(institution,'m77',false)
  or accounts_feature_access(institution,'m78',false)
  or accounts_feature_access(institution,'m79',false)
  or accounts_feature_access(institution,'m80',false)
  or accounts_feature_access(institution,'m81',false)
);
drop policy if exists accounts_detail_insert on public.ledger_entries;
create policy accounts_detail_insert on public.ledger_entries for insert to authenticated with check (
  status='pending' and created_by=(select auth.uid()) and (
    (entry_type='income' and accounts_feature_access(institution,'m63',true))
    or (entry_type='income' and fund_category='general' and accounts_feature_access(institution,'m65',true))
    or (entry_type='expense' and accounts_feature_access(institution,'m64',true))
    or (entry_type='expense' and accounts_feature_access(institution,'m70',true))
    or accounts_feature_access(institution,'m72',true)
  )
);
drop policy if exists accounts_detail_approve on public.ledger_entries;
create policy accounts_detail_approve on public.ledger_entries for update to authenticated
using (
 status='pending' and created_by<>(select auth.uid()) and (
   account_module_permission(institution,array['m63'],true,true)
   or account_module_permission(institution,array['m64'],true,true)
   or account_module_permission(institution,array['m65'],true,true)
   or account_module_permission(institution,array['m70'],true,true)
   or account_module_permission(institution,array['m80'],true,true)
 )
)
with check (status in ('approved','rejected') and approved_by=(select auth.uid()));

-- Module-specific data tables.
drop policy if exists accounts_detail_assets_read on public.account_assets;
create policy accounts_detail_assets_read on public.account_assets for select to authenticated using(accounts_feature_access(institution,'m72',false));
drop policy if exists accounts_detail_assets_insert on public.account_assets;
create policy accounts_detail_assets_insert on public.account_assets for insert to authenticated with check(accounts_feature_access(institution,'m72',true) and created_by=(select auth.uid()));
drop policy if exists accounts_detail_assets_update on public.account_assets;
create policy accounts_detail_assets_update on public.account_assets for update to authenticated using(accounts_feature_access(institution,'m72',true)) with check(accounts_feature_access(institution,'m72',true));

drop policy if exists accounts_detail_bank_read on public.account_bank_accounts;
create policy accounts_detail_bank_read on public.account_bank_accounts for select to authenticated using(
 accounts_feature_access(institution,'m66',false) or accounts_feature_access(institution,'m67',false) or accounts_feature_access(institution,'m78',false)
);

drop policy if exists accounts_detail_recon_read on public.account_bank_reconciliations;
create policy accounts_detail_recon_read on public.account_bank_reconciliations for select to authenticated using(accounts_feature_access(institution,'m78',false));
drop policy if exists accounts_detail_recon_delete on public.account_bank_reconciliations;
create policy accounts_detail_recon_delete on public.account_bank_reconciliations for delete to authenticated using(status='draft' and created_by=(select auth.uid()) and accounts_feature_access(institution,'m78',true));
drop policy if exists accounts_detail_recon_items_read on public.account_bank_reconciliation_items;
create policy accounts_detail_recon_items_read on public.account_bank_reconciliation_items for select to authenticated using(
 exists(select 1 from public.account_bank_reconciliations r where r.id=reconciliation_id and accounts_feature_access(r.institution,'m78',false))
);
drop policy if exists accounts_detail_recon_items_delete on public.account_bank_reconciliation_items;
create policy accounts_detail_recon_items_delete on public.account_bank_reconciliation_items for delete to authenticated using(
 exists(select 1 from public.account_bank_reconciliations r where r.id=reconciliation_id and r.status='draft' and accounts_feature_access(r.institution,'m78',true))
);

drop policy if exists accounts_detail_donors_read on public.account_donors;
create policy accounts_detail_donors_read on public.account_donors for select to authenticated using(accounts_feature_access(institution,'m65',false));
drop policy if exists accounts_detail_donors_insert on public.account_donors;
create policy accounts_detail_donors_insert on public.account_donors for insert to authenticated with check(accounts_feature_access(institution,'m65',true) and created_by=(select auth.uid()));
drop policy if exists accounts_detail_donors_update on public.account_donors;
create policy accounts_detail_donors_update on public.account_donors for update to authenticated using(accounts_feature_access(institution,'m65',true)) with check(accounts_feature_access(institution,'m65',true));

drop policy if exists accounts_detail_obligations_read on public.account_obligations;
create policy accounts_detail_obligations_read on public.account_obligations for select to authenticated using(accounts_feature_access(institution,'m69',false));
drop policy if exists accounts_detail_obligations_insert on public.account_obligations;
create policy accounts_detail_obligations_insert on public.account_obligations for insert to authenticated with check(accounts_feature_access(institution,'m69',true) and created_by=(select auth.uid()));
drop policy if exists accounts_detail_obligations_update on public.account_obligations;
create policy accounts_detail_obligations_update on public.account_obligations for update to authenticated using(accounts_feature_access(institution,'m69',true)) with check(accounts_feature_access(institution,'m69',true));

drop policy if exists accounts_detail_staff_read on public.account_staff;
create policy accounts_detail_staff_read on public.account_staff for select to authenticated using(accounts_feature_access(institution,'m70',false));
drop policy if exists accounts_detail_staff_insert on public.account_staff;
create policy accounts_detail_staff_insert on public.account_staff for insert to authenticated with check(accounts_feature_access(institution,'m70',true) and created_by=(select auth.uid()));
drop policy if exists accounts_detail_staff_update on public.account_staff;
create policy accounts_detail_staff_update on public.account_staff for update to authenticated using(accounts_feature_access(institution,'m70',true)) with check(accounts_feature_access(institution,'m70',true));

drop policy if exists accounts_detail_payroll_read on public.payroll_records;
create policy accounts_detail_payroll_read on public.payroll_records for select to authenticated using(accounts_feature_access(institution,'m70',false));
drop policy if exists accounts_detail_payroll_insert on public.payroll_records;
create policy accounts_detail_payroll_insert on public.payroll_records for insert to authenticated with check(accounts_feature_access(institution,'m70',true) and created_by=(select auth.uid()) and status='pending');
drop policy if exists accounts_detail_payroll_update on public.payroll_records;
create policy accounts_detail_payroll_update on public.payroll_records for update to authenticated using(accounts_feature_access(institution,'m70',true)) with check(accounts_feature_access(institution,'m70',true));

drop policy if exists accounts_detail_approval_read on public.account_approval_requests;
create policy accounts_detail_approval_read on public.account_approval_requests for select to authenticated using(accounts_feature_access(institution,'m80',false));

drop policy if exists accounts_detail_chart_read on public.account_chart_of_accounts;
create policy accounts_detail_chart_read on public.account_chart_of_accounts for select to authenticated using(
 accounts_feature_access(institution,'m62',false) or accounts_feature_access(institution,'m68',false)
 or accounts_feature_access(institution,'m76',false) or accounts_feature_access(institution,'m79',false)
 or accounts_feature_access(institution,'m81',false) or accounts_feature_access(institution,'m66',false)
);

drop policy if exists accounts_detail_journal_read on public.account_journal_entries;
create policy accounts_detail_journal_read on public.account_journal_entries for select to authenticated using(
 accounts_feature_access(institution,'m62',false) or accounts_feature_access(institution,'m68',false)
 or accounts_feature_access(institution,'m74',false) or accounts_feature_access(institution,'m75',false)
 or accounts_feature_access(institution,'m76',false) or accounts_feature_access(institution,'m77',false)
 or accounts_feature_access(institution,'m78',false) or accounts_feature_access(institution,'m79',false)
 or accounts_feature_access(institution,'m80',false) or accounts_feature_access(institution,'m81',false)
 or accounts_feature_access(institution,'m66',false) or accounts_feature_access(institution,'m67',false)
);

drop policy if exists accounts_detail_audit_read on public.audit_logs;
create policy accounts_detail_audit_read on public.audit_logs for select to authenticated using(
 table_name in ('account_bank_accounts','account_approval_requests','account_bank_reconciliations','account_journal_entries','account_journal_lines','account_donors','ledger_entries')
 and (accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m79',false)
   or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m81',false))
);
drop policy if exists accounts_detail_enterprise_audit_read on public.audit_logs;
create policy accounts_detail_enterprise_audit_read on public.audit_logs for select to authenticated using(
 table_name in ('account_staff','payroll_records','account_obligations','account_assets')
 and (accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m70',false)
   or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m69',false)
   or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m72',false)
   or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m81',false))
);
