-- Let the Audit & Verification module inspect the full Accounts audit trail.
drop policy if exists accounts_detail_audit_all_accounts_read on public.audit_logs;
create policy accounts_detail_audit_all_accounts_read on public.audit_logs
for select to authenticated using(
 table_name = any(array[
  'ledger_entries','account_donors','account_bank_accounts','account_approval_requests',
  'account_bank_reconciliations','account_bank_reconciliation_items',
  'account_journal_entries','account_journal_lines','account_staff','payroll_records',
  'account_obligations','account_assets'
 ])
 and public.accounts_feature_access(
  coalesce(after_data->>'institution',before_data->>'institution','mosque'),
  'm79',false
 )
);
