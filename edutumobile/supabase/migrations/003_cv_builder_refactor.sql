-- CV Builder refactor for edutu_mobile Supabase schema
-- Safe to apply later in Supabase SQL editor.
-- This migration assumes public.profiles(id uuid) already exists.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------
-- 1. Profiles: CV / Pro flags used by the mobile builder
-- -----------------------------------------------------
alter table public.profiles
    add column if not exists cv_trial_used boolean default false,
    add column if not exists is_pro boolean default false,
    add column if not exists pro_since timestamptz,
    add column if not exists subscription_id text;

-- -----------------------------------------------------
-- 2. CV templates
-- -----------------------------------------------------
create table if not exists public.cv_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null default 'general',
    description text,
    structure_json jsonb not null default '{"sections":[]}'::jsonb,
    is_premium boolean not null default false,
    thumbnail_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_cv_templates_name
    on public.cv_templates (name);

create index if not exists idx_cv_templates_category
    on public.cv_templates (category);

create index if not exists idx_cv_templates_premium
    on public.cv_templates (is_premium);

-- -----------------------------------------------------
-- 3. User CVs
-- -----------------------------------------------------
create table if not exists public.user_cvs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    template_id uuid references public.cv_templates(id) on delete set null,
    name text not null default 'Untitled CV',
    data_json jsonb not null default '{}'::jsonb,
    is_primary boolean not null default false,
    match_score integer not null default 0,
    target_opportunity_id uuid references public.opportunities(id) on delete set null,
    source text not null default 'manual' check (source in ('manual', 'ai_generated', 'linkedin_import', 'tailored')),
    source_prompt text,
    last_tailored_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Patch older/broken installs where user_cvs already exists but user_id is text.
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_cvs'
          and column_name = 'user_id'
          and data_type = 'text'
    ) then
        alter table public.user_cvs
            alter column user_id type uuid using nullif(user_id, '')::uuid;
    end if;
exception
    when others then
        raise notice 'Skipped user_cvs.user_id type patch: %', sqlerrm;
end $$;

alter table public.user_cvs
    add column if not exists source text default 'manual',
    add column if not exists source_prompt text,
    add column if not exists last_tailored_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'user_cvs_user_id_fkey'
    ) then
        alter table public.user_cvs
            add constraint user_cvs_user_id_fkey
            foreign key (user_id) references public.profiles(id) on delete cascade;
    end if;
exception
    when duplicate_object then null;
    when others then
        raise notice 'Skipped user_cvs_user_id_fkey add: %', sqlerrm;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'user_cvs_template_id_fkey'
    ) then
        alter table public.user_cvs
            add constraint user_cvs_template_id_fkey
            foreign key (template_id) references public.cv_templates(id) on delete set null;
    end if;
exception
    when duplicate_object then null;
    when others then
        raise notice 'Skipped user_cvs_template_id_fkey add: %', sqlerrm;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'user_cvs_target_opportunity_id_fkey'
    ) then
        alter table public.user_cvs
            add constraint user_cvs_target_opportunity_id_fkey
            foreign key (target_opportunity_id) references public.opportunities(id) on delete set null;
    end if;
exception
    when duplicate_object then null;
    when others then
        raise notice 'Skipped user_cvs_target_opportunity_id_fkey add: %', sqlerrm;
end $$;

create index if not exists idx_user_cvs_user_id
    on public.user_cvs (user_id, updated_at desc);

create index if not exists idx_user_cvs_target_opportunity_id
    on public.user_cvs (target_opportunity_id);

create unique index if not exists idx_user_cvs_single_primary
    on public.user_cvs (user_id)
    where is_primary = true;

-- -----------------------------------------------------
-- 4. Updated-at trigger
-- -----------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_cv_templates_updated_at on public.cv_templates;
create trigger set_cv_templates_updated_at
before update on public.cv_templates
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_user_cvs_updated_at on public.user_cvs;
create trigger set_user_cvs_updated_at
before update on public.user_cvs
for each row
execute function public.set_current_timestamp_updated_at();

-- -----------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------
alter table public.cv_templates enable row level security;
alter table public.user_cvs enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'cv_templates'
          and policyname = 'Templates are viewable by everyone'
    ) then
        create policy "Templates are viewable by everyone"
            on public.cv_templates
            for select
            using (true);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_cvs'
          and policyname = 'Users can view own CVs'
    ) then
        create policy "Users can view own CVs"
            on public.user_cvs
            for select
            using (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_cvs'
          and policyname = 'Users can insert own CVs'
    ) then
        create policy "Users can insert own CVs"
            on public.user_cvs
            for insert
            with check (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_cvs'
          and policyname = 'Users can update own CVs'
    ) then
        create policy "Users can update own CVs"
            on public.user_cvs
            for update
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_cvs'
          and policyname = 'Users can delete own CVs'
    ) then
        create policy "Users can delete own CVs"
            on public.user_cvs
            for delete
            using (auth.uid() = user_id);
    end if;
end $$;

-- -----------------------------------------------------
-- 6. Seed templates
-- -----------------------------------------------------
insert into public.cv_templates (name, category, description, structure_json, is_premium, thumbnail_url)
select
    seed.name,
    seed.category,
    seed.description,
    seed.structure_json::jsonb,
    seed.is_premium,
    seed.thumbnail_url
from (
    values
    (
        'Modern Professional',
        'professional',
        'Clean single-column layout for scholarships, internships, and graduate roles.',
        '{"sections":[{"id":"header","type":"header","label":"Personal Information"},{"id":"summary","type":"summary","label":"Professional Summary"},{"id":"experience","type":"experience","label":"Experience","repeatable":true},{"id":"education","type":"education","label":"Education","repeatable":true},{"id":"skills","type":"skills","label":"Skills"},{"id":"projects","type":"projects","label":"Projects","repeatable":true},{"id":"achievements","type":"achievements","label":"Achievements","repeatable":true}]}',
        false,
        null
    ),
    (
        'Academic Research',
        'academic',
        'Focused layout for scholarships, research roles, and postgraduate applications.',
        '{"sections":[{"id":"header","type":"header","label":"Personal Information"},{"id":"summary","type":"summary","label":"Research Summary"},{"id":"education","type":"education","label":"Education","repeatable":true},{"id":"research","type":"research","label":"Research Experience","repeatable":true},{"id":"publications","type":"publications","label":"Publications","repeatable":true},{"id":"skills","type":"skills","label":"Skills"},{"id":"achievements","type":"achievements","label":"Achievements","repeatable":true},{"id":"references","type":"references","label":"References","repeatable":true}]}',
        false,
        null
    ),
    (
        'Creative Portfolio',
        'creative',
        'Portfolio-friendly layout for design, product, and media applications.',
        '{"sections":[{"id":"header","type":"header","label":"Personal Information"},{"id":"summary","type":"summary","label":"Profile"},{"id":"experience","type":"experience","label":"Experience","repeatable":true},{"id":"projects","type":"projects","label":"Projects","repeatable":true},{"id":"skills","type":"skills","label":"Skills"},{"id":"achievements","type":"achievements","label":"Achievements","repeatable":true}]}',
        false,
        null
    )
) as seed(name, category, description, structure_json, is_premium, thumbnail_url)
where not exists (
    select 1
    from public.cv_templates existing
    where existing.name = seed.name
);
