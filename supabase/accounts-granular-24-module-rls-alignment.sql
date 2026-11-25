-- Granular access alignment for the 24 Accounts modules (m62-m85).
-- Run after accounts-granular-module-access.sql and the double-entry workflow migrations.
drop policy if exists account_approval_requests_read on public.account_approval_requests;
drop policy if exists account_bank_accounts_read on public.account_bank_accounts;
drop policy if exists account_bank_reconciliation_items_delete on public.account_bank_reconciliation_items;
drop policy if exists account_bank_reconciliation_items_read on public.account_bank_reconciliation_items;
drop policy if exists account_bank_reconciliations_delete on public.account_bank_reconciliations;
drop policy if exists account_bank_reconciliations_read on public.account_bank_reconciliations;
drop policy if exists account_chart_read on public.account_chart_of_accounts;
drop policy if exists account_donors_insert on public.account_donors;
drop policy if exists account_donors_read on public.account_donors;
drop policy if exists account_donors_update on public.account_donors;
drop policy if exists account_journal_read on public.account_journal_entries;
drop policy if exists assets_insert on public.account_assets;
drop policy if exists assets_read on public.account_assets;
drop policy if exists assets_update on public.account_assets;
drop policy if exists obligations_insert on public.account_obligations;
drop policy if exists obligations_read on public.account_obligations;
drop policy if exists obligations_update on public.account_obligations;
drop policy if exists account_staff_insert on public.account_staff;
drop policy if exists account_staff_read on public.account_staff;
drop policy if exists account_staff_update on public.account_staff;
drop policy if exists payroll_insert on public.payroll_records;
drop policy if exists payroll_read on public.payroll_records;
drop policy if exists payroll_update on public.payroll_records;
drop policy if exists "accounts read finance workflow audit" on public.audit_logs;
drop policy if exists "accounts staff read enterprise audit logs" on public.audit_logs;
drop policy if exists "accounts managers insert budgets" on public.budgets;
drop policy if exists "accounts managers update budgets" on public.budgets;
drop policy if exists "accounts read budgets by institution" on public.budgets;
drop policy if exists "accounts staff create pending" on public.ledger_entries;
drop policy if exists "accounts staff read own institution" on public.ledger_entries;
drop policy if exists "managers approve and edit" on public.ledger_entries;
drop policy if exists accounts_detail_budgets_read on public.budgets;
drop policy if exists accounts_detail_budgets_insert on public.budgets;
drop policy if exists accounts_detail_budgets_update on public.budgets;
drop policy if exists accounts_detail_audit_finance_read on public.audit_logs;
drop policy if exists accounts_detail_audit_staff_read on public.audit_logs;
drop policy if exists accounts_detail_ledger_read on public.ledger_entries;
drop policy if exists accounts_detail_ledger_insert on public.ledger_entries;
drop policy if exists accounts_detail_ledger_approve on public.ledger_entries;

create policy accounts_detail_approval_own_read on public.account_approval_requests
for select to authenticated using (created_by=(select auth.uid()));
create policy accounts_detail_budgets_read on public.budgets
for select to authenticated using (accounts_feature_access(institution,'m71',false));
create policy accounts_detail_budgets_insert on public.budgets
for insert to authenticated with check (accounts_feature_access(institution,'m71',true) and created_by=(select auth.uid()));
create policy accounts_detail_budgets_update on public.budgets
for update to authenticated using (accounts_feature_access(institution,'m71',true)) with check (accounts_feature_access(institution,'m71',true));

create policy accounts_detail_ledger_read on public.ledger_entries
for select to authenticated using (
 accounts_feature_access(institution,'m62',false) or accounts_feature_access(institution,'m63',false)
 or accounts_feature_access(institution,'m64',false) or accounts_feature_access(institution,'m65',false)
 or accounts_feature_access(institution,'m66',false) or accounts_feature_access(institution,'m67',false)
 or accounts_feature_access(institution,'m68',false) or accounts_feature_access(institution,'m73',false)
 or accounts_feature_access(institution,'m74',false) or accounts_feature_access(institution,'m75',false)
 or accounts_feature_access(institution,'m76',false) or accounts_feature_access(institution,'m77',false)
 or accounts_feature_access(institution,'m78',false) or accounts_feature_access(institution,'m79',false)
 or accounts_feature_access(institution,'m80',false) or accounts_feature_access(institution,'m81',false)
);
create policy accounts_detail_ledger_insert on public.ledger_entries
for insert to authenticated with check (
 status='pending' and created_by=(select auth.uid()) and
 ((entry_type='income' and accounts_feature_access(institution,'m63',true))
  or (entry_type='expense' and accounts_feature_access(institution,'m64',true)))
);
create policy accounts_detail_ledger_approve on public.ledger_entries
for update to authenticated using (
 status='pending' and (
  has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
  or account_module_permission(institution,array['m80'],true,true)
 )
) with check (
 has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution)
 or account_module_permission(institution,array['m80'],true,true)
);
create policy accounts_detail_audit_finance_read on public.audit_logs
for select to authenticated using (
 table_name=any(array['account_bank_accounts','account_approval_requests','account_bank_reconciliations','account_journal_entries','account_journal_lines','account_donors','ledger_entries'])
 and (accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m79',false)
  or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m81',false))
);
create policy accounts_detail_audit_staff_read on public.audit_logs
for select to authenticated using (
 table_name=any(array['account_staff','payroll_records','account_obligations','account_assets'])
 and (accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m69',false)
  or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m70',false)
  or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m72',false)
  or accounts_feature_access(coalesce(after_data->>'institution',before_data->>'institution','mosque'),'m81',false))
);

create or replace function public.account_submit_manual_journal(p_institution text,p_date date,p_description text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare req uuid; total_debit numeric(16,2); total_credit numeric(16,2); line_count int;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_institution not in ('mosque','foundation') or not public.accounts_feature_access(p_institution,'m76',true) then raise exception 'Not authorized for manual journals'; end if;
 if p_date is null or length(trim(coalesce(p_description,'')))=0 or jsonb_typeof(p_lines)<>'array' then raise exception 'Date, description and journal lines are required'; end if;
 select count(*),coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'credit')::numeric),0) into line_count,total_debit,total_credit from jsonb_array_elements(p_lines) x;
 if line_count<2 or total_debit<=0 or total_debit<>total_credit then raise exception 'Journal must have at least two lines and equal positive debit/credit totals'; end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where coalesce(x->>'account_code','')='' or ((coalesce((x->>'debit')::numeric,0)>0)=(coalesce((x->>'credit')::numeric,0)>0)) or coalesce((x->>'debit')::numeric,0)<0 or coalesce((x->>'credit')::numeric,0)<0) then raise exception 'Each line must contain either a positive debit or a positive credit'; end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x left join public.account_chart_of_accounts c on c.institution=p_institution and c.account_code=x->>'account_code' and c.is_active where c.id is null) then raise exception 'Unknown or inactive account code in journal'; end if;
 insert into public.account_approval_requests(institution,request_type,request_data,created_by)
 values(p_institution,'manual_journal',jsonb_build_object('journal_date',p_date,'description',p_description,'lines',p_lines),auth.uid()) returning id into req;
 return req;
end;$$;

create or replace function public.account_reverse_journal(p_journal uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.account_journal_entries%rowtype; new_journal uuid; jno bigint; actor_role text; actor_inst text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into j from public.account_journal_entries where id=p_journal for update;
 if not found or j.status<>'posted' then raise exception 'Posted journal not found'; end if;
 select role,institution into actor_role,actor_inst from public.profiles where id=auth.uid();
 if actor_role is null or actor_inst is null then raise exception 'Profile not found'; end if;
 if actor_inst not in ('both',j.institution) then raise exception 'Institution mismatch'; end if;
 if actor_role='custom_admin' then
  if not exists(select 1 from public.admin_module_permissions p where p.user_id=auth.uid() and p.module_key='m80' and p.can_view and p.can_write and p.can_approve) then raise exception 'Approval permission required'; end if;
 elsif actor_role not in ('super_admin','accounts_manager','mosque_admin','foundation_admin') then raise exception 'Approver role required'; end if;
 if (actor_role='mosque_admin' and j.institution<>'mosque') or (actor_role='foundation_admin' and j.institution<>'foundation') then raise exception 'Institution mismatch'; end if;
 if j.created_by=auth.uid() then raise exception 'The journal creator cannot approve their own reversal'; end if;
 perform pg_advisory_xact_lock(hashtext('account_journal_no_'||j.institution));
 select coalesce(max(journal_no),0)+1 into jno from public.account_journal_entries where institution=j.institution;
 insert into public.account_journal_entries(institution,journal_no,journal_date,description,source_type,source_id,status,created_by)
 values(j.institution,jno,current_date,'Reversal of journal #'||j.journal_no||': '||coalesce(p_reason,''),'adjustment',j.id,'posted',auth.uid()) returning id into new_journal;
 insert into public.account_journal_lines(journal_id,institution,account_code,description,debit,credit)
 select new_journal,institution,account_code,'Reversal: '||coalesce(p_reason,''),credit,debit from public.account_journal_lines where journal_id=j.id;
 update public.account_journal_entries set status='reversed' where id=j.id;
 return new_journal;
end;$$;
