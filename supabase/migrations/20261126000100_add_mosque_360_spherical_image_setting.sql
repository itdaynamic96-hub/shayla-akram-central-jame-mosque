-- Permit the Admin Panel's regular-photo spherical 360 viewer setting.
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
    'mosque_360_video_muted',
    'mosque_360_spherical_image'
  ));
