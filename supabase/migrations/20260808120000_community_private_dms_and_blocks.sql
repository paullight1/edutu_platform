-- Community private messages and shared moderation blocks.
--
-- User identifiers in community tables are raw Clerk subjects (text). The
-- NestJS API owns all writes; RLS remains enabled as a defense-in-depth
-- boundary if a client ever reaches these tables through PostgREST.

-- ---------------------------------------------------------------------------
-- Private community direct messages
-- ---------------------------------------------------------------------------

create table if not exists public.community_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a text not null,
  participant_b text not null,
  requested_by text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  last_message_at timestamptz not null default now(),
  constraint community_dm_conversations_ordered_pair
    check (participant_a < participant_b),
  constraint community_dm_conversations_requester_is_participant
    check (requested_by = participant_a or requested_by = participant_b),
  constraint community_dm_conversations_pair_unique
    unique (participant_a, participant_b)
);

create index if not exists community_dm_conversations_a_activity_idx
  on public.community_dm_conversations (participant_a, last_message_at desc, id desc);
create index if not exists community_dm_conversations_b_activity_idx
  on public.community_dm_conversations (participant_b, last_message_at desc, id desc);

create table if not exists public.community_dm_participants (
  conversation_id uuid not null
    references public.community_dm_conversations(id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz,
  hidden_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists community_dm_participants_user_inbox_idx
  on public.community_dm_participants (user_id, hidden_at, conversation_id);

create table if not exists public.community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.community_dm_conversations(id) on delete cascade,
  sender_id text not null,
  body text not null
    check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists community_dm_messages_history_idx
  on public.community_dm_messages (conversation_id, created_at desc, id desc);

create table if not exists public.community_dm_blocks (
  blocker_id text not null,
  blocked_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  constraint community_dm_blocks_not_self check (blocker_id <> blocked_user_id)
);

create index if not exists community_dm_blocks_blocked_idx
  on public.community_dm_blocks (blocked_user_id, blocker_id);

-- ---------------------------------------------------------------------------
-- Shared block list used by group messages, roadmap comments, and DMs
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null,
  blocked_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create unique index if not exists uq_user_blocks_pair
  on public.user_blocks (blocker_user_id, blocked_user_id);
create index if not exists idx_user_blocks_blocker
  on public.user_blocks (blocker_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------------------

alter table public.community_dm_conversations enable row level security;
alter table public.community_dm_participants enable row level security;
alter table public.community_dm_messages enable row level security;
alter table public.community_dm_blocks enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists community_dm_conversations_read_own
  on public.community_dm_conversations;
create policy community_dm_conversations_read_own
  on public.community_dm_conversations for select to authenticated
  using (
    (select auth.jwt() ->> 'sub') = participant_a
    or (select auth.jwt() ->> 'sub') = participant_b
  );

drop policy if exists community_dm_participants_read_own
  on public.community_dm_participants;
create policy community_dm_participants_read_own
  on public.community_dm_participants for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists community_dm_messages_read_own
  on public.community_dm_messages;
create policy community_dm_messages_read_own
  on public.community_dm_messages for select to authenticated
  using (
    exists (
      select 1
      from public.community_dm_participants participant
      where participant.conversation_id = community_dm_messages.conversation_id
        and participant.user_id = (select auth.jwt() ->> 'sub')
    )
  );

drop policy if exists community_dm_blocks_read_own
  on public.community_dm_blocks;
create policy community_dm_blocks_read_own
  on public.community_dm_blocks for select to authenticated
  using ((select auth.jwt() ->> 'sub') = blocker_id);

-- `user_blocks` is keyed by derived user UUIDs because it is shared with the
-- roadmap moderation schema. Only the API/service role may read or mutate it;
-- direct client access would otherwise create an identity-mapping oracle.
drop policy if exists user_blocks_service_role_only on public.user_blocks;
create policy user_blocks_service_role_only
  on public.user_blocks for all to service_role
  using (true) with check (true);

revoke insert, update, delete on public.community_dm_conversations
  from anon, authenticated;
revoke insert, update, delete on public.community_dm_participants
  from anon, authenticated;
revoke insert, update, delete on public.community_dm_messages
  from anon, authenticated;
revoke insert, update, delete on public.community_dm_blocks
  from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;

grant select on public.community_dm_conversations to authenticated;
grant select on public.community_dm_participants to authenticated;
grant select on public.community_dm_messages to authenticated;
grant select on public.community_dm_blocks to authenticated;
grant select, insert, update, delete on public.community_dm_conversations to service_role;
grant select, insert, update, delete on public.community_dm_participants to service_role;
grant select, insert, update, delete on public.community_dm_messages to service_role;
grant select, insert, update, delete on public.community_dm_blocks to service_role;
grant select, insert, update, delete on public.user_blocks to service_role;
