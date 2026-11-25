-- Super Admin controlled Admin dashboard composition.
create table if not exists public.admin_dashboard_settings (
  id text primary key default 'default' check (id = 'default'),
  settings jsonb not null default '{
    "metrics":["income","expense","pending","members","events","tasks","projects","reports"],
    "sections":["shortcuts","finance","upcoming","recent"],
    "quick_modules":["m04","m05","m06","m13","m14","m15","m16","m32","m61","m62","m63","m64","m74"]
  }'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.admin_dashboard_settings enable row level security;
drop policy if exists "authenticated read dashboard settings" on public.admin_dashboard_settings;
create policy "authenticated read dashboard settings"
on public.admin_dashboard_settings for select to authenticated using (true);
drop policy if exists "super admins insert dashboard settings" on public.admin_dashboard_settings;
create policy "super admins insert dashboard settings"
on public.admin_dashboard_settings for insert to authenticated
with check (public.has_access(array['super_admin'], null) and updated_by = (select auth.uid()));
drop policy if exists "super admins update dashboard settings" on public.admin_dashboard_settings;
create policy "super admins update dashboard settings"
on public.admin_dashboard_settings for update to authenticated
using (public.has_access(array['super_admin'], null))
with check (public.has_access(array['super_admin'], null) and updated_by = (select auth.uid()));
grant select, insert, update on public.admin_dashboard_settings to authenticated;
insert into public.admin_dashboard_settings(id, settings)
values ('default', '{
  "metrics":["income","expense","pending","members","events","tasks","projects","reports"],
  "sections":["shortcuts","finance","upcoming","recent"],
  "quick_modules":["m04","m05","m06","m13","m14","m15","m16","m32","m61","m62","m63","m64","m74"]
}'::jsonb)
on conflict (id) do nothing;
