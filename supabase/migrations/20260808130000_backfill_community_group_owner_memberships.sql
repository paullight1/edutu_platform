-- Repair legacy groups whose canonical owner row exists but whose derived
-- membership row was never created. Group/message/resource authorization uses
-- active memberships, so listing an owner-only group without repairing this
-- row would reveal a destination the owner still could not open or post in.
--
-- Deliberately INSERT-only: an existing removed or banned owner membership is
-- an explicit moderation state and must never be resurrected by a backfill.

with repaired as (
  insert into public.community_group_members (
    group_id,
    user_id,
    role,
    status,
    joined_at
  )
  select
    community_group.id,
    community_group.owner_id,
    'owner',
    'active',
    community_group.created_at
  from public.community_groups community_group
  where not exists (
    select 1
    from public.community_group_members membership
    where membership.group_id = community_group.id
      and membership.user_id = community_group.owner_id
  )
  on conflict (group_id, user_id) do nothing
  returning group_id
)
update public.community_groups community_group
set member_count = (
  select count(*)::integer
  from public.community_group_members membership
  where membership.group_id = community_group.id
    and membership.status = 'active'
)
where exists (
  select 1 from repaired where repaired.group_id = community_group.id
);
