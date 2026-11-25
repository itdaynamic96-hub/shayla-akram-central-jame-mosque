-- Keep pg_temp explicitly last in SECURITY DEFINER helper search paths.
-- This prevents temporary objects from shadowing public tables during privilege checks.
alter function public.account_module_permission(text,text[],boolean,boolean) set search_path = public, pg_temp;
alter function public.chanda_can_access(boolean) set search_path = public, pg_temp;
alter function public.has_access(text[],text) set search_path = public, pg_temp;
alter function public.module_record_access(text,text,boolean) set search_path = public, pg_temp;
alter function public.module_record_approval_access(text,text) set search_path = public, pg_temp;

-- Harden every remaining SECURITY DEFINER routine that still used public-only.
alter function public.create_current_chanda_due() set search_path = public, pg_temp;
alter function public.create_profile_for_new_user() set search_path = public, pg_temp;
alter function public.guard_module_record_publication() set search_path = public, pg_temp;
alter function public.log_ledger_change() set search_path = public, pg_temp;
alter function public.log_module_record_change() set search_path = public, pg_temp;
alter function public.replace_admin_module_permissions(uuid,jsonb) set search_path = public, pg_temp;
alter function public.run_chanda_daily_jobs() set search_path = public, pg_temp;
