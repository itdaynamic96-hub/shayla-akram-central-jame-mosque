-- Remove superseded ledger policies. The canonical detailed policies
-- retain module-specific income/expense scoping and already cover these grants.
drop policy if exists accounts_detail_ledger_read on public.ledger_entries;
drop policy if exists accounts_detail_ledger_insert on public.ledger_entries;
