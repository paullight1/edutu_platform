-- Author identity for roadmap templates (creator_name already exists)
alter table public.roadmaps add column if not exists author_role text;
alter table public.roadmaps add column if not exists author_avatar text;

-- Learner comments on roadmaps/templates
create table if not exists public.roadmap_comments (
    id uuid primary key default gen_random_uuid(),
    roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
    user_id uuid not null,
    author_name text not null default 'Edutu learner',
    body text not null check (char_length(body) between 1 and 1000),
    rating integer check (rating between 1 and 5),
    created_at timestamp with time zone default now()
);

create index if not exists idx_roadmap_comments_roadmap on public.roadmap_comments(roadmap_id, created_at desc);
create index if not exists idx_roadmap_comments_user on public.roadmap_comments(user_id);

alter table public.roadmap_comments enable row level security;

-- Comments are public social proof; writes go through the backend (service role)
drop policy if exists "Anyone can view roadmap comments" on public.roadmap_comments;
create policy "Anyone can view roadmap comments"
    on public.roadmap_comments for select
    using (true);

drop policy if exists "Service role full access to roadmap comments" on public.roadmap_comments;
create policy "Service role full access to roadmap comments"
    on public.roadmap_comments for all
    to service_role
    using (true) with check (true);
