-- Scheduled community voice calls. All user identifiers are raw Clerk subjects.
-- Writes are service-role only; authenticated clients receive SELECT grants
-- constrained by RLS. This migration is additive and safe to re-run.

create table if not exists public.community_group_calls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  scheduled_for timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  status text not null default 'scheduled'
    check (status in ('scheduled','starting','live','ended','cancelled','expired','failed')),
  created_by text not null,
  started_by text,
  ended_by text,
  started_at timestamptz,
  ring_expires_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  media_node_id text,
  media_room_id text,
  failure_code text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists community_group_calls_one_live_idx
  on public.community_group_calls (group_id)
  where status in ('starting','live');
create index if not exists community_group_calls_history_idx
  on public.community_group_calls (group_id, scheduled_for desc);
create index if not exists community_group_calls_lifecycle_idx
  on public.community_group_calls (status, scheduled_for);

create table if not exists public.community_group_call_participants (
  call_id uuid not null references public.community_group_calls(id) on delete cascade,
  user_id text not null,
  role_at_start text not null check (role_at_start in ('owner','mod','member')),
  invite_status text not null default 'pending'
    check (invite_status in ('pending','ringing','notified','joined','declined','missed','unreachable')),
  first_notified_at timestamptz,
  first_joined_at timestamptz,
  last_joined_at timestamptz,
  left_at timestamptz,
  join_reservation_jti text,
  join_reserved_until timestamptz,
  joined_count integer not null default 0 check (joined_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_id, user_id)
);
alter table public.community_group_call_participants
  add column if not exists join_reservation_jti text;
alter table public.community_group_call_participants
  add column if not exists join_reserved_until timestamptz;
create index if not exists community_group_call_participants_user_idx
  on public.community_group_call_participants (user_id, created_at desc);
create index if not exists community_group_call_participants_outcome_idx
  on public.community_group_call_participants (call_id, invite_status);

create table if not exists public.community_group_call_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.community_group_calls(id) on delete cascade,
  actor_id text,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);
create index if not exists community_group_call_events_history_idx
  on public.community_group_call_events (call_id, created_at, id);
create unique index if not exists community_group_call_events_idempotency_idx
  on public.community_group_call_events (call_id, type, idempotency_key)
  where idempotency_key is not null;

-- Transactional outbox for initial ringing. One row is inserted atomically
-- with the live transition; workers use expiring leases and SKIP LOCKED.
create table if not exists public.community_group_call_ring_jobs (
  call_id uuid primary key references public.community_group_calls(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','completed','expired')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)
  )
);
create index if not exists community_group_call_ring_jobs_due_idx
  on public.community_group_call_ring_jobs
    (status, next_attempt_at, lease_expires_at);

alter table public.community_group_messages
  add column if not exists call_id uuid
    references public.community_group_calls(id) on delete set null;
create unique index if not exists community_group_messages_call_idx
  on public.community_group_messages (call_id)
  where call_id is not null;

-- A native/Expo token identifies a physical app installation. Keep one owner
-- per provider+token so switching accounts cannot ring the previous account.
delete from public.notification_push_tokens older
using public.notification_push_tokens newer
where older.provider = newer.provider
  and older.token = newer.token
  and older.id <> newer.id
  and (
    coalesce(older.last_seen_at, older.created_at, '-infinity'::timestamptz)
      < coalesce(newer.last_seen_at, newer.created_at, '-infinity'::timestamptz)
    or (
      coalesce(older.last_seen_at, older.created_at, '-infinity'::timestamptz)
        = coalesce(newer.last_seen_at, newer.created_at, '-infinity'::timestamptz)
      and older.id < newer.id
    )
  );
create unique index if not exists notification_push_tokens_provider_token_unique
  on public.notification_push_tokens (provider, token);

-- Existing installations have a check created by the group-discussions
-- migration; widen it explicitly because CREATE TABLE IF NOT EXISTS cannot.
alter table public.community_group_messages
  drop constraint if exists community_group_messages_kind_check;
alter table public.community_group_messages
  add constraint community_group_messages_kind_check
  check (kind in ('text','system','opportunity','image','file','call'));

alter table public.community_group_calls enable row level security;
alter table public.community_group_call_participants enable row level security;
alter table public.community_group_call_events enable row level security;
alter table public.community_group_call_ring_jobs enable row level security;

drop policy if exists community_group_calls_read on public.community_group_calls;
create policy community_group_calls_read
  on public.community_group_calls for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id)
  );

drop policy if exists community_group_call_participants_read on public.community_group_call_participants;
create policy community_group_call_participants_read
  on public.community_group_call_participants for select to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists community_group_call_events_read on public.community_group_call_events;
create policy community_group_call_events_read
  on public.community_group_call_events for select to authenticated
  using (
    exists (
      select 1
      from public.community_group_calls c
      where c.id = call_id
        and (
          public.community_group_is_public(c.group_id)
          or public.community_is_active_member(c.group_id)
        )
    )
  );

grant select on public.community_group_calls to authenticated;
grant select on public.community_group_call_participants to authenticated;
grant select on public.community_group_call_events to authenticated;

grant select, insert, update, delete on public.community_group_calls to service_role;
grant select, insert, update, delete on public.community_group_call_participants to service_role;
grant select, insert on public.community_group_call_events to service_role;
grant select, insert, update, delete on public.community_group_call_ring_jobs to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_group_calls'
  ) then
    alter publication supabase_realtime add table public.community_group_calls;
  end if;
end $$;
