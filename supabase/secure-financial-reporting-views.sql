-- Financial views must enforce caller privileges and underlying table RLS.
-- PostgreSQL 15+ supports security_invoker views.
alter view public.account_trial_balance set (security_invoker = true);
alter view public.account_balance_sheet set (security_invoker = true);
alter view public.account_bank_account_balances set (security_invoker = true);
alter view public.account_cash_bank_book set (security_invoker = true);
alter view public.account_journal_report set (security_invoker = true);
grant select on table public.account_balance_sheet to authenticated;
