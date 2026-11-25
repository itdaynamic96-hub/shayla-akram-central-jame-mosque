-- Keep pg_temp explicitly last in SECURITY DEFINER helper search paths.
-- This prevents temporary objects from shadowing public tables during privilege checks.
alter function public.account_module_permission(text,text[],boolean,boolean) set search_path = public, pg_temp;
alter function public.chanda_can_access(boolean) set search_path = public, pg_temp;
alter function public.has_access(text[],text) set search_path = public, pg_temp;
alter function public.module_record_access(text,text,boolean) set search_path = public, pg_temp;
alter function public.module_record_approval_access(text,text) set search_path = public, pg_temp;
