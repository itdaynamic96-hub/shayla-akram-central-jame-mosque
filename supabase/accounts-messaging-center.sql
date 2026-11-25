-- Accounts messaging center: provider-neutral queue, attempts, and strict institution scoping.
create or replace function public.accounts_message_access(target_institution text, write_access boolean default false)
returns boolean language sql stable security invoker set search_path=public,pg_temp
as $$
 select exists (
  select 1 from public.profiles p
  where p.id=(select auth.uid())
    and (p.institution='both' or p.institution=target_institution)
    and (
      p.role in ('super_admin','admin','accounts_manager','accountant','mosque_admin','foundation_admin')
      or (not write_access and p.role='auditor')
      or (p.role='custom_admin' and exists (
        select 1 from public.admin_module_permissions mp
        where mp.user_id=p.id and mp.module_key between 'm41' and 'm50'
          and mp.can_view and (not write_access or mp.can_write)
      ))
    )
    and (p.role<>'mosque_admin' or target_institution='mosque')
    and (p.role<>'foundation_admin' or target_institution='foundation')
    and (not write_access or p.role not in ('auditor','viewer'))
 );
$$;
revoke all on function public.accounts_message_access(text,boolean) from public,anon;
grant execute on function public.accounts_message_access(text,boolean) to authenticated;

create table if not exists public.accounts_message_queue (
 id uuid primary key default gen_random_uuid(),
 institution text not null check(institution in ('mosque','foundation')),
 recipient_name text not null default '',
 recipient_phone text not null check(recipient_phone ~ '^\\+?[0-9][0-9]{7,14}$'),
 message text not null check(length(trim(message)) between 1 and 4000),
 source_module text not null default 'manual',
 source_record_id text not null default '',
 status text not null default 'queued' check(status in ('queued','processing','awaiting_delivery','delivered','read','failed')),
 active_channel text not null default 'none' check(active_channel in ('none','whatsapp','sms')),
 provider_message_id text not null default '',
 attempt_count integer not null default 0 check(attempt_count>=0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 delivered_at timestamptz,
 read_at timestamptz
);
create index if not exists accounts_message_queue_institution_created_idx
 on public.accounts_message_queue(institution,created_at desc);
create index if not exists accounts_message_queue_status_idx
 on public.accounts_message_queue(status,created_at) where status in ('queued','failed','awaiting_delivery');

create table if not exists public.accounts_message_attempts (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.accounts_message_queue(id),
 channel text not null check(channel in ('whatsapp','sms')),
 status text not null check(status in ('accepted','failed','delivered','read')),
 provider_message_id text not null default '',
 error_code text not null default '',
 error_message text not null default '',
 attempted_at timestamptz not null default now()
);
create index if not exists accounts_message_attempts_message_idx
 on public.accounts_message_attempts(message_id,attempted_at desc);

alter table public.accounts_message_queue enable row level security;
alter table public.accounts_message_attempts enable row level security;
drop policy if exists accounts_message_queue_read on public.accounts_message_queue;
create policy accounts_message_queue_read on public.accounts_message_queue
 for select to authenticated using(public.accounts_message_access(institution,false));
drop policy if exists accounts_message_queue_insert on public.accounts_message_queue;
create policy accounts_message_queue_insert on public.accounts_message_queue
 for insert to authenticated with check(
  public.accounts_message_access(institution,true)
  and created_by=(select auth.uid()) and status='queued'
  and active_channel='none' and attempt_count=0
 );
drop policy if exists accounts_message_attempts_read on public.accounts_message_attempts;
create policy accounts_message_attempts_read on public.accounts_message_attempts
 for select to authenticated using(exists(
  select 1 from public.accounts_message_queue q
  where q.id=message_id and public.accounts_message_access(q.institution,false)
 ));
grant select,insert on public.accounts_message_queue to authenticated;
grant select on public.accounts_message_attempts to authenticated;
