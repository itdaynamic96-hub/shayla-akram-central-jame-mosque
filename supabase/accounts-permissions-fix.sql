-- Accounts permission repair for existing Supabase projects.
-- Safe to run more than once. Keeps RLS enabled and does not expose service_role.
grant select, insert, update on table public.ledger_entries to authenticated;
grant select, insert, update on table public.budgets to authenticated;
alter table public.ledger_entries enable row level security;
alter table public.budgets enable row level security;

drop policy if exists "accounts staff read own institution" on public.ledger_entries;
create policy "accounts staff read own institution" on public.ledger_entries for select to authenticated
using (public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],institution));

drop policy if exists "accounts staff create pending" on public.ledger_entries;
create policy "accounts staff create pending" on public.ledger_entries for insert to authenticated
with check (status='pending' and created_by=auth.uid()
and public.has_access(array['super_admin','accounts_manager','accountant'],institution));

drop policy if exists "managers approve and edit" on public.ledger_entries;
create policy "managers approve and edit" on public.ledger_entries for update to authenticated
using (status='pending' and public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));

drop policy if exists "accounts read budgets by institution" on public.budgets;
create policy "accounts read budgets by institution" on public.budgets for select to authenticated
using (public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],institution));
drop policy if exists "accounts managers insert budgets" on public.budgets;
create policy "accounts managers insert budgets" on public.budgets for insert to authenticated
with check (created_by=auth.uid() and public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));
drop policy if exists "accounts managers update budgets" on public.budgets;
create policy "accounts managers update budgets" on public.budgets for update to authenticated
using (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution))
with check (public.has_access(array['super_admin','accounts_manager','mosque_admin','foundation_admin'],institution));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('private-receipts','private-receipts',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "accounts upload own institution receipts" on storage.objects;
create policy "accounts upload own institution receipts" on storage.objects for insert to authenticated
with check (bucket_id='private-receipts' and owner_id=auth.uid()::text
and public.has_access(array['super_admin','accounts_manager','accountant'],split_part(name,'/',1)));
drop policy if exists "accounts read institution receipts" on storage.objects;
create policy "accounts read institution receipts" on storage.objects for select to authenticated
using (bucket_id='private-receipts'
and public.has_access(array['super_admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'],split_part(name,'/',1)));

revoke delete on table public.ledger_entries from anon,authenticated;
