create table if not exists public.youtube_upload_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  source_record_id uuid not null,
  source_video_url text not null,
  title text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  privacy_status text not null default 'unlisted' check (privacy_status in ('public','unlisted','private')),
  upload_status text not null default 'ready' check (upload_status in ('ready','queued','uploading','uploaded','failed','skipped')),
  youtube_video_id text,
  youtube_url text,
  error_message text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_record_id)
);

create index if not exists youtube_upload_queue_batch_idx
  on public.youtube_upload_queue (batch_id, created_at);
create index if not exists youtube_upload_queue_status_idx
  on public.youtube_upload_queue (upload_status, updated_at desc);

alter table public.youtube_upload_queue enable row level security;
revoke all on public.youtube_upload_queue from anon;
grant select, insert, update, delete on public.youtube_upload_queue to authenticated;

drop policy if exists "youtube queue admins read" on public.youtube_upload_queue;
create policy "youtube queue admins read" on public.youtube_upload_queue
  for select to authenticated
  using (public.has_access(array['super_admin','admin','website_admin'],null));

drop policy if exists "youtube queue admins insert" on public.youtube_upload_queue;
create policy "youtube queue admins insert" on public.youtube_upload_queue
  for insert to authenticated
  with check (
    public.has_access(array['super_admin','admin','website_admin'],null)
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

drop policy if exists "youtube queue admins update" on public.youtube_upload_queue;
create policy "youtube queue admins update" on public.youtube_upload_queue
  for update to authenticated
  using (public.has_access(array['super_admin','admin','website_admin'],null))
  with check (
    public.has_access(array['super_admin','admin','website_admin'],null)
    and updated_by = (select auth.uid())
  );

drop policy if exists "youtube queue admins delete" on public.youtube_upload_queue;
create policy "youtube queue admins delete" on public.youtube_upload_queue
  for delete to authenticated
  using (public.has_access(array['super_admin','admin','website_admin'],null));

comment on table public.youtube_upload_queue is
  'Prepared YouTube upload queue for approved, published mosque website videos. No Google OAuth tokens are stored here.';
