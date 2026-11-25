-- Align selected-module permissions with the one-worker full-access model.
-- Also cover the foreign keys reported by Supabase performance advisors.
create index if not exists account_obligation_payments_approved_by_idx
  on public.account_obligation_payments(approved_by);
create index if not exists account_obligation_payments_bank_account_id_idx
  on public.account_obligation_payments(bank_account_id);
create index if not exists account_obligation_payments_created_by_idx
  on public.account_obligation_payments(created_by);
create index if not exists account_obligation_payments_obligation_id_idx
  on public.account_obligation_payments(obligation_id);
create index if not exists ledger_entries_bank_account_id_idx
  on public.ledger_entries(bank_account_id);
create index if not exists site_media_settings_updated_by_idx
  on public.site_media_settings(updated_by);

create or replace function public.replace_admin_module_permissions(target_user uuid, permission_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the trusted server function may replace module permissions.';
  end if;
  if permission_rows is null
     or jsonb_typeof(permission_rows) <> 'array'
     or jsonb_array_length(permission_rows) > 85 then
    raise exception 'Invalid module permission list.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(permission_rows) as item(value)
    where jsonb_typeof(item.value) <> 'object'
       or coalesce(item.value->>'module_key','') !~ '^m(0[1-9]|[1-7][0-9]|8[0-5])$'
  ) then
    raise exception 'Invalid module key in permission list.';
  end if;
  if (
    select count(*) <> count(distinct item.value->>'module_key')
    from jsonb_array_elements(permission_rows) as item(value)
  ) then
    raise exception 'Duplicate module keys are not allowed.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_user and role = 'custom_admin'
  ) then
    raise exception 'Target must be an existing Custom Admin.';
  end if;

  delete from public.admin_module_permissions where user_id = target_user;
  insert into public.admin_module_permissions(user_id,module_key,can_view,can_write,can_approve)
  select target_user,item.value->>'module_key',true,true,true
  from jsonb_array_elements(permission_rows) as item(value);
end;
$function$;
