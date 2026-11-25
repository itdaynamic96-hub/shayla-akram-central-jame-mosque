# Accounts finance workflow implementation

The Accounts dashboard uses granular module permissions m62–m85 for the 24 modules and keeps the existing SAKM-61 authentication, institution switcher, permission checks, Chanda engine, and message centre. The navigation now exposes 24 separate modules:

1. Dashboard
2. Income
3. Expenses
4. Donors and donations
5. Bank and cash accounts
6. Transfers
7. Cash book and ledger
8. Outstanding bills
9. Payroll
10. Budgets
11. Funds
12. Receipts and vouchers
13. Financial reports
14. PDF and Excel reports
15. Manual journals, trial balance and balance sheet
16. Advanced search
17. Bank reconciliation
18. Audit verification
19. Approvals
20. Audit trail
21. Users and permissions
22. Settings
23. Messages and notifications
24. Monthly Chanda

## Database work applied to Supabase

Project: `lmwczibsipczfymhyqba`

The following migrations were applied directly to the project:

- `accounts_full_workflow_core`
- `accounts_workflow_runtime_fixes`
- `accounts_documents_audit_balance_sheet`
- `accounts_bank_reconciliation_matching`
- `accounts_donor_register`
- `accounts_donor_mobile_index_fix`
- `accounts_finance_security_and_reversal`
- `accounts_reverse_journal_approval_guard`
- `accounts_reconciliation_allow_zero_activity`
- `accounts_final_workflow_privilege_lockdown`
- `accounts_granular_24_module_rls_alignment`
- `accounts_payroll_approval_granular_access`

Core RPCs used by the dashboard:

- `account_create_bank_account`
- `account_submit_bank_transfer`
- `account_submit_manual_journal`
- `account_decide_request`
- `account_create_bank_reconciliation`
- `account_add_reconciliation_item`
- `account_reconcile_bank`
- `account_reverse_journal`

## Financial controls

- Mosque and Foundation data are scoped separately.
- Bank-account opening balances are represented by opening journals. The legacy cashbook is a `security_invoker` view over ledger entries and is protected by the cashbook module's RLS grant.
- Manual journals must contain at least two lines and equal debit/credit totals before entering the approval queue.
- A requester cannot approve their own request. Payroll editing uses m70, while payroll approval requires the separate m80 approval grant.
- Posted journal lines cannot be edited or deleted. Corrections use a reversal journal.
- Reconciliation book balances are calculated server-side. Each statement line must match a posted journal line for the same account, date, direction and amount; the closing balance must equal the book balance.
- Receipt and voucher document numbers are assigned by a database trigger as `RCPT-YYYY-######` and `VCH-YYYY-######`.
- Donor identity can be linked to income entries; the donor register is separate from monthly Chanda.
- Audit records are generated for the new finance workflow.

## Reporting

The PDF action opens the browser print dialog, where the user can select Save as PDF. The Excel action creates a workbook containing ledger transactions, trial balance, balance sheet, bank-account balances and audit history.

## Acceptance checks still required

No live approved ledger transactions existed when the database changes were applied. Before using this for statutory or production accounting, an authorized Mosque and Foundation user should test a sample income, expense, bank transfer, manual journal approval, journal reversal, and statement reconciliation in each institution. External WhatsApp/SMS delivery still requires provider credentials.
