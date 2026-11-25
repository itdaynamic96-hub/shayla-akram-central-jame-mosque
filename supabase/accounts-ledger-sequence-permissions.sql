-- Allow authenticated ledger writers to allocate their own receipt/voucher numbers.
-- RLS still governs ledger rows; no sequence read or update privilege is granted.
grant usage on sequence public.account_receipt_seq to authenticated;
grant usage on sequence public.account_voucher_seq to authenticated;
