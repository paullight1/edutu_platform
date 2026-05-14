-- Deadline-aware opportunity roadmap playbooks and durable adoption state

alter table if exists public.roadmaps
    add column if not exists opportunity_id text,
    add column if not exists creator_proof jsonb,
    add column if not exists deadline_strategy text,
    add column if not exists community_id text,
    add column if not exists version integer default 1,
    add column if not exists calendar_sync_enabled boolean default false;

create index if not exists idx_roadmaps_opportunity_id on public.roadmaps(opportunity_id);
create index if not exists idx_roadmaps_community_id on public.roadmaps(community_id);

alter table if exists public.roadmap_enrollments
    add column if not exists target_opportunity_id text,
    add column if not exists target_deadline timestamp with time zone,
    add column if not exists calendar_sync_enabled boolean default false,
    add column if not exists adopted_plan jsonb default '{}'::jsonb,
    add column if not exists updated_at timestamp with time zone default now();

create index if not exists idx_enrollments_target_opportunity_id
    on public.roadmap_enrollments(target_opportunity_id);

create index if not exists idx_enrollments_target_deadline
    on public.roadmap_enrollments(target_deadline);
