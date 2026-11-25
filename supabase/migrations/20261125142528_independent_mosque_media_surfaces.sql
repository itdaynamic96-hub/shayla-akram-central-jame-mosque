-- Allow the homepage, Accounts, and Admin Panel to manage separate mosque images.
alter table public.site_media_settings
  drop constraint if exists site_media_settings_key_check;

alter table public.site_media_settings
  add constraint site_media_settings_key_check
  check (setting_key in (
    'mosque_main',
    'mosque_360_panorama',
    'mosque_homepage',
    'mosque_accounts',
    'mosque_admin',
    'mosque_360_video',
    'mosque_360_video_muted'
  ));
