-- SAKM-61 Admin and Accounts authorization hardening.
create or replace function public.module_record_approval_access(target_key text,target_institution text)
returns boolean language sql stable security definer
set search_path=public,pg_temp as $function$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and (
  p.role='super_admin'
  or (p.role='custom_admin' and (p.institution='both' or p.institution=target_institution)
   and exists(select 1 from public.admin_module_permissions mp where mp.user_id=p.id and mp.module_key=target_key and mp.can_view and mp.can_write and mp.can_approve))
  or (substring(target_key from 2)::integer between 21 and 30 and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque'))
  or (substring(target_key from 2)::integer between 31 and 40 and p.role in ('admin','foundation_admin') and p.institution in ('both','foundation'))
  or (substring(target_key from 2)::integer between 41 and 50 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution))
  or (substring(target_key from 2)::integer between 7 and 20 and p.role in ('admin','website_admin'))
  or (target_key='m51' and p.role='admin' and p.institution in ('both','mosque') and target_institution='mosque')
  or (substring(target_key from 2)::integer between 62 and 84 and p.role in ('admin','accounts_manager') and (p.institution='both' or p.institution=target_institution) and target_institution in ('mosque','foundation'))
  or (target_key='m85' and p.role in ('admin','mosque_admin','accounts_manager') and p.institution in ('both','mosque') and target_institution='mosque')
  or (target_key='m61' and p.role in ('admin','mosque_admin') and p.institution in ('both','mosque') and target_institution='mosque')
 ));
$function$;

drop policy if exists accounts_detail_audit_all_accounts_read on public.audit_logs;
create policy accounts_detail_audit_all_accounts_read on public.audit_logs
for select to authenticated using(
 table_name=any(array['ledger_entries','account_donors','account_bank_accounts','account_approval_requests','account_bank_reconciliations','account_bank_reconciliation_items','account_journal_entries','account_journal_lines','account_staff','payroll_records','account_obligations','account_assets'])
 and (
  public.accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m79',false)
  or public.accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m81',false)
 )
);
create index if not exists admin_dashboard_settings_updated_by_idx on public.admin_dashboard_settings(updated_by);
