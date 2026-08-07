-- Private Community DMs and message requests.
-- All user ids are raw Clerk subjects; writes are owned by the Nest API.

create table if not exists public.community_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a text not null,
  participant_b text not null,
  requested_by text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  last_message_at timestamptz not null default now(),
  constraint community_dm_conversations_ordered_pair
    check (participant_a < participant_b),
  constraint community_dm_conversations_requester_is_participant
    check (requested_by = participant_a or requested_by = participant_b),
  constraint community_dm_conversations_status
    check (status in ('pending', 'accepted', 'declined')),
  constraint community_dm_conversations_pair_unique
    unique (participant_a, participant_b)
);

create index if not exists community_dm_conversations_a_activity_idx
  on public.community_dm_conversations (participant_a, last_message_at desc, id desc);
create index if not exists community_dm_conversations_b_activity_idx
  on public.community_dm_conversations (participant_b, last_message_at desc, id desc);

create table if not exists public.community_dm_participants (
  conversation_id uuid not null references public.community_dm_conversations(id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz,
  hidden_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists community_dm_participants_user_inbox_idx
  on public.community_dm_participants (user_id, hidden_at, conversation_id);

create table if not exists public.community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.community_dm_conversations(id) on delete cascade,
  sender_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint community_dm_messages_body_length
    check (char_length(btrim(body)) between 1 and 2000)
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

-- The mobile apps never query these tables directly. RLS still provides a
-- read-only safety boundary if a future client accidentally reaches PostgREST;
-- mutations remain API-only because no authenticated write policies exist.
alter table public.community_dm_conversations enable row level security;
alter table public.community_dm_participants enable row level security;
alter table public.community_dm_messages enable row level security;
alter table public.community_dm_blocks enable row level security;

drop policy if exists community_dm_conversations_read_own on public.community_dm_conversations;
create policy community_dm_conversations_read_own
  on public.community_dm_conversations for select to authenticated
  using (
    (auth.jwt() ->> 'sub') = participant_a
    or (auth.jwt() ->> 'sub') = participant_b
  );

drop policy if exists community_dm_participants_read_own on public.community_dm_participants;
create policy community_dm_participants_read_own
  on public.community_dm_participants for select to authenticated
  using ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists community_dm_messages_read_own on public.community_dm_messages;
create policy community_dm_messages_read_own
  on public.community_dm_messages for select to authenticated
  using (
    exists (
      select 1
      from public.community_dm_participants participant
      where participant.conversation_id = community_dm_messages.conversation_id
        and participant.user_id = (auth.jwt() ->> 'sub')
    )
  );

drop policy if exists community_dm_blocks_read_own on public.community_dm_blocks;
create policy community_dm_blocks_read_own
  on public.community_dm_blocks for select to authenticated
  using ((auth.jwt() ->> 'sub') = blocker_id);

revoke insert, update, delete on public.community_dm_conversations from authenticated, anon;
revoke insert, update, delete on public.community_dm_participants from authenticated, anon;
revoke insert, update, delete on public.community_dm_messages from authenticated, anon;
revoke insert, update, delete on public.community_dm_blocks from authenticated, anon;
