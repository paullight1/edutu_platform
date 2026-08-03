-- Group Discussions. See docs/superpowers/specs/2026-08-03-group-discussions-design.md
-- user_id columns hold the RAW Clerk subject (text), never the derived uuid.

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  opportunity_id uuid references opportunities(id) on delete set null,
  owner_id text not null,
  visibility text not null default 'public' check (visibility in ('public','private')),
  join_policy text not null default 'open' check (join_policy in ('open','request')),
  cover_emoji text not null default '💬',
  accent text,
  expires_at timestamptz,
  archived_at timestamptz,
  member_count integer not null default 0,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_groups_opportunity_idx on community_groups(opportunity_id);
create index if not exists community_groups_owner_idx on community_groups(owner_id);
create index if not exists community_groups_active_idx on community_groups(archived_at, last_message_at desc);

create table if not exists community_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (role in ('owner','mod','member')),
  status text not null default 'active' check (status in ('active','pending','removed','banned')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists community_group_members_user_idx on community_group_members(user_id, status);

create table if not exists community_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  body text not null,
  kind text not null default 'text' check (kind in ('text','system','opportunity')),
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);
create index if not exists community_group_messages_group_idx
  on community_group_messages(group_id, created_at desc);

create table if not exists community_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists community_group_forms (
  group_id uuid primary key references community_groups(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('message','group')),
  target_id uuid not null,
  reporter_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);

alter table community_groups enable row level security;
alter table community_group_members enable row level security;
alter table community_group_messages enable row level security;
alter table community_join_requests enable row level security;
alter table community_group_forms enable row level security;
alter table community_reports enable row level security;

-- Realtime reads. auth.jwt()->>'sub' is the raw Clerk subject, matching user_id.
create policy community_groups_read on community_groups for select to authenticated
  using (
    visibility = 'public'
    or exists (
      select 1 from community_group_members m
      where m.group_id = community_groups.id
        and m.user_id = auth.jwt() ->> 'sub'
        and m.status = 'active'
    )
  );

create policy community_group_members_read on community_group_members for select to authenticated
  using (
    exists (
      select 1 from community_groups g
      where g.id = community_group_members.group_id
        and (g.visibility = 'public' or g.owner_id = auth.jwt() ->> 'sub')
    )
    or user_id = auth.jwt() ->> 'sub'
  );

create policy community_group_messages_read on community_group_messages for select to authenticated
  using (
    exists (
      select 1 from community_group_members m
      where m.group_id = community_group_messages.group_id
        and m.user_id = auth.jwt() ->> 'sub'
        and m.status = 'active'
    )
  );

create policy community_join_requests_read on community_join_requests for select to authenticated
  using (
    user_id = auth.jwt() ->> 'sub'
    or exists (
      select 1 from community_groups g
      where g.id = community_join_requests.group_id
        and g.owner_id = auth.jwt() ->> 'sub'
    )
  );

create policy community_group_forms_read on community_group_forms for select to authenticated
  using (true);

-- community_reports gets NO select policy on purpose: a reporter must not be
-- able to enumerate reports, and members must not see who reported them.
-- The service role bypasses RLS and is the only reader.

alter publication supabase_realtime add table community_group_messages;
