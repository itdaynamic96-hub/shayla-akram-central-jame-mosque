create table if not exists public.site_media_settings (
 setting_key text primary key,
 public_url text not null,
 storage_path text,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint site_media_settings_key_check check (setting_key in ('mosque_main'))
);
alter table public.site_media_settings enable row level security;
drop policy if exists "public can read mosque media settings" on public.site_media_settings;
create policy "public can read mosque media settings" on public.site_media_settings for select to anon, authenticated using (true);
drop policy if exists "website admins manage mosque media settings" on public.site_media_settings;
create policy "website admins manage mosque media settings" on public.site_media_settings for all to authenticated
 using (public.has_access(array['super_admin','admin','website_admin'], null))
 with check (public.has_access(array['super_admin','admin','website_admin'], null));
grant select on public.site_media_settings to anon, authenticated;
grant insert, update, delete on public.site_media_settings to authenticated;
drop policy if exists "mosque brand admins upload" on storage.objects;
create policy "mosque brand admins upload" on storage.objects for insert to authenticated
 with check (bucket_id='site-media' and name like 'mosque-brand/%' and owner_id=(auth.uid())::text and public.has_access(array['super_admin','admin','website_admin'],null));
drop policy if exists "mosque brand admins read" on storage.objects;
create policy "mosque brand admins read" on storage.objects for select to authenticated
 using (bucket_id='site-media' and name like 'mosque-brand/%' and public.has_access(array['super_admin','admin','website_admin'],null));
