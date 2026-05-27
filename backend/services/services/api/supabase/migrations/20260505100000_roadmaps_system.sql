-- Migration: Dedicated Roadmaps System
-- Replaces community_stories-based roadmap storage with proper schema

create table if not exists public.roadmaps (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    slug text unique not null,
    description text not null,
    category text not null default 'general',
    difficulty text not null default 'beginner',
    estimated_duration text,
    target_audience text,
    prerequisites text,
    outcomes text,
    cover_image text,
    status text not null default 'draft',
    created_by uuid not null,
    creator_name text not null default 'Edutu Admin',
    is_featured boolean default false,
    enrollment_count integer default 0,
    rating_avg numeric(3,2) default 0,
    rating_count integer default 0,
    steps jsonb not null default '[]'::jsonb,
    resources jsonb default '[]'::jsonb,
    related_opportunities text[] default '{}',
    ai_intent_tags text[] default '{}',
    ai_generated_summary text,
    satisfaction_score numeric(3,2) default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    published_at timestamp with time zone
);

create index if not exists idx_roadmaps_status on public.roadmaps(status);
create index if not exists idx_roadmaps_category on public.roadmaps(category);
create index if not exists idx_roadmaps_difficulty on public.roadmaps(difficulty);
create index if not exists idx_roadmaps_created_by on public.roadmaps(created_by);
create index if not exists idx_roadmaps_featured on public.roadmaps(is_featured);
create index if not exists idx_roadmaps_slug on public.roadmaps(slug);
create index if not exists idx_roadmaps_ai_tags on public.roadmaps using gin(ai_intent_tags);

-- User enrollments in roadmaps
create table if not exists public.roadmap_enrollments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
    status text not null default 'enrolled',
    progress integer default 0,
    current_step integer default 0,
    completed_steps jsonb default '[]'::jsonb,
    enrolled_at timestamp with time zone default now(),
    completed_at timestamp with time zone,
    unique(user_id, roadmap_id)
);

create index if not exists idx_enrollments_user_id on public.roadmap_enrollments(user_id);
create index if not exists idx_enrollments_roadmap_id on public.roadmap_enrollments(roadmap_id);

-- User intent profiles for roadmap matching
create table if not exists public.user_roadmap_intents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    goals text[],
    current_level text,
    target_category text,
    time_commitment text,
    learning_style text,
    preferred_format text,
    additional_context text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(user_id)
);

create index if not exists idx_user_intents_user_id on public.user_roadmap_intents(user_id);

-- Roadmap satisfaction feedback
create table if not exists public.roadmap_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
    satisfaction_score integer not null check (satisfaction_score between 1 and 5),
    met_expectations boolean,
    what_worked text,
    what_improved text,
    would_recommend boolean,
    created_at timestamp with time zone default now()
);

create index if not exists idx_feedback_roadmap_id on public.roadmap_feedback(roadmap_id);
create index if not exists idx_feedback_user_id on public.roadmap_feedback(user_id);

-- Enable RLS
alter table public.roadmaps enable row level security;
alter table public.roadmap_enrollments enable row level security;
alter table public.user_roadmap_intents enable row level security;
alter table public.roadmap_feedback enable row level security;

-- RLS Policies: roadmaps
create policy "Anyone can view published roadmaps"
    on public.roadmaps for select
    using (status = 'published');

create policy "Service role full access to roadmaps"
    on public.roadmaps for all
    using (true) with check (true);

-- RLS Policies: enrollments
create policy "Users can view own enrollments"
    on public.roadmap_enrollments for select
    using (auth.uid() = user_id);

create policy "Users can create own enrollments"
    on public.roadmap_enrollments for insert
    with check (auth.uid() = user_id);

create policy "Users can update own enrollments"
    on public.roadmap_enrollments for update
    using (auth.uid() = user_id);

create policy "Service role full access to enrollments"
    on public.roadmap_enrollments for all
    using (true) with check (true);

-- RLS Policies: intents
create policy "Users can view own intent"
    on public.user_roadmap_intents for select
    using (auth.uid() = user_id);

create policy "Users can create/update own intent"
    on public.user_roadmap_intents for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Service role full access to intents"
    on public.user_roadmap_intents for all
    using (true) with check (true);

-- RLS Policies: feedback
create policy "Anyone can view feedback (for stats)"
    on public.roadmap_feedback for select
    using (true);

create policy "Users can create own feedback"
    on public.roadmap_feedback for insert
    with check (auth.uid() = user_id);

create policy "Users can update own feedback"
    on public.roadmap_feedback for update
    using (auth.uid() = user_id);

create policy "Service role full access to feedback"
    on public.roadmap_feedback for all
    using (true) with check (true);

-- Function: Update roadmap satisfaction score from feedback
create or replace function public.update_roadmap_satisfaction()
returns trigger as $$
begin
    update public.roadmaps
    set satisfaction_score = (
        select avg(satisfaction_score)::numeric(3,2)
        from public.roadmap_feedback
        where roadmap_id = NEW.roadmap_id
    )
    where id = NEW.roadmap_id;
    return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_update_satisfaction
    after insert or update on public.roadmap_feedback
    for each row
    execute function public.update_roadmap_satisfaction();

-- Function: Auto-generate slug from title
create or replace function public.generate_roadmap_slug()
returns trigger as $$
begin
    if NEW.slug is null or NEW.slug = '' then
        NEW.slug = lower(regexp_replace(NEW.title, '[^a-zA-Z0-9\s-]', '', 'g'));
        NEW.slug = regexp_replace(NEW.slug, '\s+', '-', 'g');
        NEW.slug = NEW.slug || '-' || substr(md5(random()::text), 1, 6);
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_generate_slug
    before insert on public.roadmaps
    for each row
    execute function public.generate_roadmap_slug();

-- Function: Get recommended roadmaps for user based on intent
create or replace function public.get_recommended_roadmaps(
    p_user_id uuid,
    p_limit integer default 10
)
returns setof public.roadmaps
language sql
security definer
as $$
    select r.*
    from public.roadmaps r
    left join public.user_roadmap_intents i on i.user_id = p_user_id
    where r.status = 'published'
    and (
        -- Match by intent tags
        (i.target_category is not null and r.category = i.target_category)
        or
        -- Match by AI intent tags overlap
        (i.goals is not null and r.ai_intent_tags && i.goals)
        or
        -- Fallback: featured roadmaps
        r.is_featured = true
    )
    order by
        r.is_featured desc,
        r.rating_avg desc,
        r.enrollment_count desc,
        r.created_at desc
    limit p_limit;
$$;

-- Function: Get roadmap stats for admin dashboard
create or replace function public.get_roadmap_stats()
returns table(
    total_roadmaps bigint,
    published_roadmaps bigint,
    draft_roadmaps bigint,
    total_enrollments bigint,
    avg_satisfaction numeric,
    top_categories jsonb
)
language sql
security definer
as $$
    select
        (select count(*) from public.roadmaps) as total_roadmaps,
        (select count(*) from public.roadmaps where status = 'published') as published_roadmaps,
        (select count(*) from public.roadmaps where status = 'draft') as draft_roadmaps,
        (select count(*) from public.roadmap_enrollments) as total_enrollments,
        (select avg(satisfaction_score) from public.roadmap_feedback) as avg_satisfaction,
        (
            select jsonb_agg(row_to_json(x))
            from (
                select category, count(*) as count
                from public.roadmaps
                where status = 'published'
                group by category
                order by count desc
                limit 5
            ) x
        ) as top_categories;
$$;
