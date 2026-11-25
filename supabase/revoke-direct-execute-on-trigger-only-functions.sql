-- These are trigger-only SECURITY DEFINER functions, not callable RPC endpoints.
-- Existing triggers continue to invoke them; direct API execution is unnecessary.
REVOKE EXECUTE ON FUNCTION public.sync_obligation_payment_from_ledger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_ledger_bank_account() FROM PUBLIC, anon, authenticated;
