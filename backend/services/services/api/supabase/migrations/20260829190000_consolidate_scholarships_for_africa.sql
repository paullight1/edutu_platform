-- Consolidate the fragmented community catalogue into one durable, public
-- platform community. Active members are carried forward; old posts are not.
-- The existing Africa Opportunity Circle id is retained so deployed deep links
-- do not break. Re-running this migration is safe.

begin;

create temporary table community_master_consolidation_state on commit drop as
select exists (
  select 1
  from public.community_groups community
  where
    community.id <> 'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102'
    or community.slug <> 'scholarships-for-africa'
) or not exists (
  select 1
  from public.community_groups community
  where community.id = 'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102'
) as needed;

create temporary table community_master_active_members on commit drop as
select
  member.user_id,
  min(member.joined_at) as joined_at
from public.community_group_members member
where member.status = 'active'
group by member.user_id;

-- A target id in community_reports is polymorphic and therefore has no FK.
-- Delete these rows explicitly before the cascades remove their targets.
delete from public.community_reports report
where
  (select needed from community_master_consolidation_state)
  and (
  (report.target_type = 'message' and exists (
    select 1
    from public.community_group_messages message
    where message.id = report.target_id
  ))
  or
  (report.target_type = 'group' and exists (
    select 1
    from public.community_groups community
    where community.id = report.target_id
  )));

-- Clear the old conversations, including the retained group's history. Likes,
-- comments and call-linked rows follow their declared cascades.
delete from public.community_group_messages
where (select needed from community_master_consolidation_state);

-- Free the unique trending slot before the master upsert.
update public.community_groups set trending_rank = null
where (select needed from community_master_consolidation_state);

insert into public.community_groups (
  id,
  slug,
  name,
  description,
  owner_id,
  visibility,
  join_policy,
  cover_emoji,
  accent,
  member_count,
  message_count,
  last_message_at,
  management_scope,
  trending_rank,
  archived_at,
  expires_at,
  updated_at
)
select
  'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102',
  'scholarships-for-africa',
  'Scholarships for Africa',
  'A pan-African community for verified scholarships, fellowships, grants, internships, and practical application support.',
  'system:edutu-curated',
  'public',
  'open',
  '🎓',
  '#F45B16',
  0,
  0,
  null,
  'platform',
  1,
  null,
  null,
  now()
where (select needed from community_master_consolidation_state)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  owner_id = excluded.owner_id,
  visibility = excluded.visibility,
  join_policy = excluded.join_policy,
  cover_emoji = excluded.cover_emoji,
  accent = excluded.accent,
  message_count = 0,
  last_message_at = null,
  management_scope = excluded.management_scope,
  trending_rank = excluded.trending_rank,
  archived_at = null,
  expires_at = null,
  updated_at = now();

delete from public.community_groups
where
  id <> 'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102'
  and (select needed from community_master_consolidation_state);

insert into public.community_group_members (
  group_id,
  user_id,
  role,
  status,
  joined_at
)
select
  'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102',
  member.user_id,
  'member',
  'active',
  member.joined_at
from community_master_active_members member
on conflict (group_id, user_id) do update set
  role = case
    when public.community_group_members.role = 'owner' then 'owner'
    else 'member'
  end,
  status = case
    when public.community_group_members.status = 'banned' then 'banned'
    else 'active'
  end,
  joined_at = least(
    public.community_group_members.joined_at,
    excluded.joined_at
  );

update public.community_groups community
set
  member_count = (
    select count(*)::integer
    from public.community_group_members member
    where member.group_id = community.id and member.status = 'active'
  ),
  message_count = 0,
  last_message_at = null,
  updated_at = now()
where
  community.id = 'b6f1f92d-7f1e-4ce4-8c63-1cbb0b52a102'
  and (select needed from community_master_consolidation_state);

-- Preserve request history while ensuring no stale request remains actionable.
update public.community_creation_requests
set
  status = 'cancelled',
  review_reason = coalesce(
    review_reason,
    'Closed when communities were consolidated into Scholarships for Africa.'
  ),
  reviewed_by = coalesce(reviewed_by, 'system:community-consolidation'),
  reviewed_at = coalesce(reviewed_at, now()),
  updated_at = now()
where
  status = 'pending'
  and (select needed from community_master_consolidation_state);

create index if not exists community_group_messages_opportunity_idx
  on public.community_group_messages (opportunity_id);

commit;
