alter table community_group_messages
  add column if not exists parent_message_id uuid
    references community_group_messages(id) on delete cascade,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text;

create table if not exists community_message_likes (
  message_id uuid not null
    references community_group_messages(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  constraint community_message_likes_pkey primary key (message_id, user_id)
);

create index if not exists community_group_messages_comments_idx
  on community_group_messages (parent_message_id, created_at, id)
  where parent_message_id is not null;

create index if not exists community_message_likes_user_idx
  on community_message_likes (user_id, created_at desc);

create unique index if not exists community_group_messages_one_pin_idx
  on community_group_messages (group_id)
  where pinned_at is not null
    and parent_message_id is null
    and deleted_at is null;

alter table community_message_likes enable row level security;

revoke all on table community_message_likes from anon, authenticated;
