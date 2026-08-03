-- Group Discussions. See docs/superpowers/specs/2026-08-03-group-discussions-design.md
-- user_id columns hold the RAW Clerk subject (text), never the derived uuid.
-- Every statement is schema-qualified so the result does not depend on the
-- applying role's search_path. This migration is safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  owner_id text not null,
  visibility text not null default 'public' check (visibility in ('public','private')),
  join_policy text not null default 'open' check (join_policy in ('open','request')),
  cover_emoji text not null default '💬',
  accent text,
  expires_at timestamptz,
  archived_at timestamptz,
  member_count integer not null default 0 check (member_count >= 0),
  message_count integer not null default 0 check (message_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_groups_opportunity_idx
  on public.community_groups (opportunity_id);
create index if not exists community_groups_owner_idx
  on public.community_groups (owner_id);
-- Partial: archived_at is NULL for essentially every live row, so indexing it
-- as a leading column wastes the index. The live feed only ever reads unarchived.
drop index if exists public.community_groups_active_idx;
create index if not exists community_groups_active_idx
  on public.community_groups (last_message_at desc)
  where archived_at is null;

create table if not exists public.community_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (role in ('owner','mod','member')),
  status text not null default 'active' check (status in ('active','pending','removed','banned')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists community_group_members_user_idx
  on public.community_group_members (user_id, status);

create table if not exists public.community_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id text not null,
  body text not null check (char_length(body) <= 2000),
  kind text not null default 'text' check (kind in ('text','system','opportunity')),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);
create index if not exists community_group_messages_group_idx
  on public.community_group_messages (group_id, created_at desc);

create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id text not null,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Intentional: one request row per (group, user) forever. Re-applying after a
  -- rejection is an UPSERT on this constraint in the backend, not a second row.
  unique (group_id, user_id)
);
create index if not exists community_join_requests_user_idx
  on public.community_join_requests (user_id);

create table if not exists public.community_group_forms (
  group_id uuid primary key references public.community_groups(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('message','group')),
  target_id uuid not null,
  reporter_id text not null,
  reason text not null check (char_length(reason) <= 280),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists community_reports_status_idx
  on public.community_reports (status, created_at);
create index if not exists community_reports_target_idx
  on public.community_reports (target_type, target_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.community_group_messages enable row level security;
alter table public.community_join_requests enable row level security;
alter table public.community_group_forms enable row level security;
alter table public.community_reports enable row level security;

-- Policy-expression subqueries are themselves subject to the referenced table's
-- RLS, so a policy on A that reads B while B's policy reads A deadlocks Postgres
-- with 42P17 "infinite recursion detected in policy". These SECURITY DEFINER
-- helpers run as the owner and bypass RLS, breaking the cycle. search_path is
-- pinned on every one of them: an unpinned SECURITY DEFINER function is a
-- privilege-escalation vector.

create or replace function public.community_is_active_member(gid uuid, uid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_group_members m
    where m.group_id = gid and m.user_id = uid and m.status = 'active'
  );
$$;

create or replace function public.community_group_is_public(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_groups g
    where g.id = gid and g.visibility = 'public'
  );
$$;

create or replace function public.community_is_owner_or_mod(gid uuid, uid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_group_members m
    where m.group_id = gid
      and m.user_id = uid
      and m.status = 'active'
      and m.role in ('owner','mod')
  );
$$;

revoke execute on function public.community_is_active_member(uuid, text) from public;
revoke execute on function public.community_group_is_public(uuid) from public;
revoke execute on function public.community_is_owner_or_mod(uuid, text) from public;
grant execute on function public.community_is_active_member(uuid, text) to authenticated;
grant execute on function public.community_group_is_public(uuid) to authenticated;
grant execute on function public.community_is_owner_or_mod(uuid, text) to authenticated;

-- Realtime reads. auth.jwt() ->> 'sub' is the raw Clerk subject, matching user_id.
-- It is always wrapped in (select ...) so the planner evaluates it once per query
-- as an InitPlan rather than once per candidate row (Supabase auth_rls_initplan).

drop policy if exists community_groups_read on public.community_groups;
create policy community_groups_read on public.community_groups for select to authenticated
  using (
    visibility = 'public'
    or public.community_is_active_member(id, (select auth.jwt() ->> 'sub'))
  );

-- Members of a private group must be able to see the roster, not just themselves.
drop policy if exists community_group_members_read on public.community_group_members;
create policy community_group_members_read on public.community_group_members for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id, (select auth.jwt() ->> 'sub'))
    or user_id = (select auth.jwt() ->> 'sub')
  );

-- Public groups are read-before-join: any signed-in user may read the messages.
drop policy if exists community_group_messages_read on public.community_group_messages;
create policy community_group_messages_read on public.community_group_messages for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id, (select auth.jwt() ->> 'sub'))
  );

-- Requester sees their own row; owner AND mods see the whole pending queue.
drop policy if exists community_join_requests_read on public.community_join_requests;
create policy community_join_requests_read on public.community_join_requests for select to authenticated
  using (
    user_id = (select auth.jwt() ->> 'sub')
    or public.community_is_owner_or_mod(group_id, (select auth.jwt() ->> 'sub'))
  );

-- A group's screening form is readable exactly when the group is. A prospective
-- joiner must be able to read the questions in order to answer them, and
-- request-to-join groups are necessarily public (visibility controls
-- discoverability, join_policy controls entry).
drop policy if exists community_group_forms_read on public.community_group_forms;
create policy community_group_forms_read on public.community_group_forms for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id, (select auth.jwt() ->> 'sub'))
  );

-- community_reports gets NO policy of any kind on purpose: a reporter must not be
-- able to enumerate reports, and members must not see who reported them.
-- The service role bypasses RLS and is the only reader. No grant is issued below.

grant select on public.community_groups to authenticated;
grant select on public.community_group_members to authenticated;
grant select on public.community_group_messages to authenticated;
grant select on public.community_join_requests to authenticated;
grant select on public.community_group_forms to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_group_messages'
  ) then
    alter publication supabase_realtime add table public.community_group_messages;
  end if;
end
$$;
