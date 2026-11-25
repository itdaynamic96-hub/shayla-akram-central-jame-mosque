-- The Accounts UI reads approved/pending obligation settlements directly.
-- RLS policy account_obligation_payments_read remains the row-level boundary.
grant select on table public.account_obligation_payments to authenticated;
