-- Support a separately managed equirectangular 360-degree mosque panorama.
alter table public.site_media_settings
  drop constraint if exists site_media_settings_key_check;
alter table public.site_media_settings
  add constraint site_media_settings_key_check
  check (setting_key in ('mosque_main','mosque_360_panorama'));

drop policy if exists "mosque brand admins delete" on storage.objects;
create policy "mosque brand admins delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-media'
    and name like 'mosque-brand/%'
    and public.has_access(array['super_admin','admin','website_admin'], null)
  );
grant delete on storage.objects to authenticated;
