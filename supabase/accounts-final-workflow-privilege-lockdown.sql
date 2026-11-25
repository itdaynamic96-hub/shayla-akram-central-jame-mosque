-- Applied after the Accounts bank-account and reconciliation tables are installed.
-- All bank-account and reconciliation writes must go through the server-validated RPCs.
revoke insert,update,delete,truncate,references,trigger on public.account_bank_accounts from authenticated;
grant select on public.account_bank_accounts to authenticated;
revoke insert,update,truncate,references,trigger on public.account_bank_reconciliations from authenticated;
grant select on public.account_bank_reconciliations to authenticated;
revoke insert,update,truncate,references,trigger on public.account_bank_reconciliation_items from authenticated;
grant select,delete on public.account_bank_reconciliation_items to authenticated;
drop policy if exists account_bank_accounts_insert on public.account_bank_accounts;
drop policy if exists account_bank_accounts_update on public.account_bank_accounts;
drop policy if exists account_bank_reconciliations_insert on public.account_bank_reconciliations;
drop policy if exists account_bank_reconciliations_update on public.account_bank_reconciliations;
drop policy if exists account_bank_reconciliation_items_insert on public.account_bank_reconciliation_items;
revoke all on function public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid) from public,anon;
grant execute on function public.account_add_reconciliation_item(uuid,date,text,text,numeric,text,uuid) to authenticated;
