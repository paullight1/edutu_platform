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
  -- 'invited' and 'pending' are deliberately DIFFERENT states, not one state
  -- read two ways:
  --   invited  an owner or mod put this person here (backend `invite`). It is a
  --            standing decision to admit them, so accepting it activates the
  --            row whatever the group's visibility or join policy is.
  --   pending  the person put themselves here (backend `join` on a
  --            request-to-join group) and nobody has approved them yet.
  -- Overloading one status for both, and telling them apart by reading
  -- community_groups.visibility, is unsound because visibility is mutable: an
  -- owner flipping a public request-to-join group to private would silently
  -- convert their whole unvetted applicant queue into a guest list.
  status text not null default 'active'
    check (status in ('active','invited','pending','removed','banned')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists community_group_members_user_idx
  on public.community_group_members (user_id, status);

-- The status check above only lands on a database that has never seen this
-- table: `create table if not exists` is a silent no-op everywhere else, so a
-- dev or branch database carrying the earlier 4-status version would keep it and
-- `invite()` would raise a raw 23514 on the first 'invited' row. Restating the
-- constraint unconditionally is what makes "safe to re-run" true rather than
-- true-only-on-a-fresh-database. Drop-then-add is safe here because the table is
-- not yet in production, so there is no window in which bad rows could land, and
-- the new set is a strict superset of the old one so ADD cannot fail on
-- existing rows.
alter table public.community_group_members
  drop constraint if exists community_group_members_status_check;
alter table public.community_group_members
  add constraint community_group_members_status_check
  check (status in ('active','invited','pending','removed','banned'));

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
--
-- DO NOT ever apply `force row level security` to these tables. The recursion fix
-- above depends entirely on the table owner's built-in RLS exemption: forcing RLS
-- makes the owner subject to the policies too, the SECURITY DEFINER helpers stop
-- bypassing them, and the 42P17 infinite recursion returns immediately.
--
-- The membership helpers deliberately take NO subject argument. They read the
-- caller's own Clerk subject out of the JWT, so a signed-in user can only ever
-- ask "am I a member of this group?" — never "is <other user> a member of this
-- private group?". A subject-taking definer function granted to `authenticated`
-- is a membership oracle: group uuids leak via share links and deep links, and
-- Clerk subjects are bulk-harvestable from any public group's roster.

-- Earlier drafts shipped two-argument overloads. Postgres would keep them
-- alongside the new one-argument versions and the leaky variant would stay
-- callable, so drop them by full old signature. CASCADE clears any policy left
-- depending on them; every policy is recreated below.
drop function if exists public.community_is_active_member(uuid, text) cascade;
drop function if exists public.community_is_owner_or_mod(uuid, text) cascade;

-- "Active" means exactly status = 'active'. The 'invited' and 'pending' states
-- are NOT membership: an invitee can read their own membership row (the
-- `user_id = sub` arm of community_group_members_read) but cannot read the
-- private group itself, its roster, or its messages through Supabase. That is
-- intentional — an unaccepted invitation must not hand out the group's content.
-- CONSEQUENCE FOR CLIENTS: the invite-preview screen (group name, cover, who
-- invited you) MUST be fetched from the backend, which runs as service_role and
-- applies GroupsService.get's own rule. A direct client select will come back
-- empty for an invitee, and that is the correct behaviour, not a bug to "fix"
-- by widening this helper.
create or replace function public.community_is_active_member(gid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.community_group_members m
    where m.group_id = gid
      and m.user_id = (select auth.jwt() ->> 'sub')
      and m.status = 'active'
  );
$$;

create or replace function public.community_group_is_public(gid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.community_groups g
    where g.id = gid and g.visibility = 'public'
  );
$$;

-- Belt and braces: community_groups.owner_id is the canonical, NOT NULL record of
-- ownership, while community_group_members.role is a second, unsynchronised copy.
-- If group creation ever fails to write the creator's role='owner' membership row,
-- or that row's status drifts off 'active', resolving ownership from membership
-- alone would lock the real owner out of their own pending-request queue.
create or replace function public.community_is_owner_or_mod(gid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.community_group_members m
    where m.group_id = gid
      and m.user_id = (select auth.jwt() ->> 'sub')
      and m.status = 'active'
      and m.role in ('owner','mod')
  ) or exists (
    select 1 from public.community_groups g
    where g.id = gid
      and g.owner_id = (select auth.jwt() ->> 'sub')
  );
$$;

-- Revoke from PUBLIC *and* from anon. Supabase's `alter default privileges`
-- grants EXECUTE on new public-schema functions to anon and authenticated
-- explicitly, and a PUBLIC revoke does not remove an explicit role grant — so
-- after the first apply these were still reachable by a signed-out caller over
-- /rest/v1/rpc/ (caught by the anon_security_definer_function_executable
-- advisor). Every policy below is `to authenticated`, so anon never needs them;
-- community_group_is_public in particular was an existence oracle for arbitrary
-- group uuids.
revoke execute on function public.community_is_active_member(uuid) from public;
revoke execute on function public.community_group_is_public(uuid) from public;
revoke execute on function public.community_is_owner_or_mod(uuid) from public;
revoke execute on function public.community_is_active_member(uuid) from anon;
revoke execute on function public.community_group_is_public(uuid) from anon;
revoke execute on function public.community_is_owner_or_mod(uuid) from anon;
grant execute on function public.community_is_active_member(uuid) to authenticated;
grant execute on function public.community_group_is_public(uuid) to authenticated;
grant execute on function public.community_is_owner_or_mod(uuid) to authenticated;

-- Realtime reads. auth.jwt() ->> 'sub' is the raw Clerk subject, matching user_id.
-- It is always wrapped in (select ...) so the planner evaluates it once per query
-- as an InitPlan rather than once per candidate row (Supabase auth_rls_initplan).

drop policy if exists community_groups_read on public.community_groups;
create policy community_groups_read on public.community_groups for select to authenticated
  using (
    visibility = 'public'
    or public.community_is_active_member(id)
  );

-- Members of a private group must be able to see the roster, not just themselves.
drop policy if exists community_group_members_read on public.community_group_members;
create policy community_group_members_read on public.community_group_members for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id)
    or user_id = (select auth.jwt() ->> 'sub')
  );

-- Public groups are read-before-join: any signed-in user may read the messages.
--
-- SOFT DELETE MUST BLANK `body`, not just stamp `deleted_at`. The client reads
-- this table directly through Supabase, so RLS is the only boundary there is:
-- leaving the text in place lets any member — or any signed-in user, for a public
-- group — run `select body from community_group_messages where deleted_at is not
-- null` and read back exactly the content a moderator removed.
-- Do NOT "fix" that by adding `and deleted_at is null` to this policy. Doing so
-- hides the soft-delete UPDATE from Realtime subscribers (the post-update row no
-- longer passes the read check), so the tombstone never propagates and the
-- deleted message stays on screen until a full reload.
drop policy if exists community_group_messages_read on public.community_group_messages;
create policy community_group_messages_read on public.community_group_messages for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id)
  );

-- Requester sees their own row; owner AND mods see the whole pending queue.
drop policy if exists community_join_requests_read on public.community_join_requests;
create policy community_join_requests_read on public.community_join_requests for select to authenticated
  using (
    user_id = (select auth.jwt() ->> 'sub')
    or public.community_is_owner_or_mod(group_id)
  );

-- A group's screening form is readable exactly when the group is. A prospective
-- joiner must be able to read the questions in order to answer them, and
-- request-to-join groups are necessarily public (visibility controls
-- discoverability, join_policy controls entry).
drop policy if exists community_group_forms_read on public.community_group_forms;
create policy community_group_forms_read on public.community_group_forms for select to authenticated
  using (
    public.community_group_is_public(group_id)
    or public.community_is_active_member(group_id)
  );

-- community_reports gets NO row-level policy of any kind on purpose: a reporter
-- must not be able to enumerate reports, and members must not see who reported
-- them. The service role bypasses RLS and is the only reader. The service_role
-- grant below is a table privilege, not a policy — RLS bypass does not imply the
-- table privilege, and without it the backend gets 42501 on every read/insert.

grant select on public.community_groups to authenticated;
grant select on public.community_group_members to authenticated;
grant select on public.community_group_messages to authenticated;
grant select on public.community_join_requests to authenticated;
grant select on public.community_group_forms to authenticated;

-- Every write in this feature goes through the backend as service_role. These
-- explicit grants mean we are not relying on Supabase's default privileges, so
-- the backend role must be named explicitly for all six tables — including
-- community_reports, which has no `authenticated` grant at all.
grant select, insert, update, delete on public.community_groups to service_role;
grant select, insert, update, delete on public.community_group_members to service_role;
grant select, insert, update, delete on public.community_group_messages to service_role;
grant select, insert, update, delete on public.community_join_requests to service_role;
grant select, insert, update, delete on public.community_group_forms to service_role;
grant select, insert, update, delete on public.community_reports to service_role;

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
