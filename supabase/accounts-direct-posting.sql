-- Allow authorized Accounts operators to post income/expense entries immediately.
-- Existing pending rows remain pending and can still be reviewed through the approvals module.

drop policy if exists accounts_detail_insert on public.ledger_entries;
create policy accounts_detail_insert
on public.ledger_entries
for insert
to authenticated
with check (
  status = 'approved'
  and created_by = (select auth.uid())
  and approved_by = (select auth.uid())
  and approved_at is not null
  and (
    (entry_type = 'income' and accounts_feature_access(institution, 'm63', true))
    or (entry_type = 'income' and fund_category = 'general' and accounts_feature_access(institution, 'm65', true))
    or (entry_type = 'expense' and accounts_feature_access(institution, 'm64', true))
    or (entry_type = 'expense' and accounts_feature_access(institution, 'm70', true))
    or accounts_feature_access(institution, 'm72', true)
  )
);

-- The existing posting function creates balanced journal lines for approved entries.
-- Add an INSERT trigger so an entry inserted directly as approved is posted exactly once.
drop trigger if exists ledger_entry_double_entry_post_insert on public.ledger_entries;
create trigger ledger_entry_double_entry_post_insert
after insert on public.ledger_entries
for each row
when (new.status = 'approved')
execute function public.post_approved_ledger_entry_to_journal();
