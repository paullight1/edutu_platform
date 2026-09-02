-- Community creation approval, platform ownership, and curated discovery.

alter table public.community_groups
  add column if not exists management_scope text not null default 'member',
  add column if not exists trending_rank integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.community_groups
  add constraint community_groups_management_scope_check
  check (management_scope in ('member', 'platform'));

alter table public.community_groups
  add constraint community_groups_trending_rank_check
  check (trending_rank is null or trending_rank > 0);

create unique index community_groups_trending_rank_unique
  on public.community_groups (trending_rank)
  where trending_rank is not null;

create index community_groups_management_scope_owner_idx
  on public.community_groups (management_scope, owner_id)
  where archived_at is null;

create table public.community_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null,
  name text not null,
  description text,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  join_policy text not null default 'open'
    check (join_policy in ('open', 'request')),
  cover_emoji text not null default '💬',
  cover_image_resource_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  approved_group_id uuid references public.community_groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_creation_requests_requester_status_idx
  on public.community_creation_requests (requester_id, status, created_at desc);

create index community_creation_requests_pending_queue_idx
  on public.community_creation_requests (created_at asc, id asc)
  where status = 'pending';

create unique index community_creation_requests_approved_group_unique
  on public.community_creation_requests (approved_group_id)
  where approved_group_id is not null;

alter table public.community_creation_requests enable row level security;
revoke all on table public.community_creation_requests from anon, authenticated;

update public.community_groups
set management_scope = 'platform', updated_at = now()
where owner_id = 'system:edutu-curated';
