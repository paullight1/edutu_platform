-- CV builder supporting logs / exports
-- Safe to apply after 003_cv_builder_refactor.sql

create extension if not exists "pgcrypto";

create table if not exists public.cv_exports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    cv_id uuid references public.user_cvs(id) on delete set null,
    export_type text not null default 'share' check (export_type in ('share', 'pdf', 'docx', 'txt')),
    target_opportunity_id uuid references public.opportunities(id) on delete set null,
    status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
    metadata jsonb not null default '{}'::jsonb,
    exported_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table if not exists public.cv_tailoring_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    cv_id uuid references public.user_cvs(id) on delete set null,
    opportunity_id uuid references public.opportunities(id) on delete set null,
    request_context jsonb not null default '{}'::jsonb,
    result_summary jsonb not null default '{}'::jsonb,
    match_score integer default 0,
    model_name text,
    source text not null default 'ai' check (source in ('ai', 'manual', 'hybrid')),
    created_at timestamptz not null default now()
);

create index if not exists idx_cv_exports_user_id
    on public.cv_exports (user_id, exported_at desc);

create index if not exists idx_cv_exports_cv_id
    on public.cv_exports (cv_id);

create index if not exists idx_cv_tailoring_logs_user_id
    on public.cv_tailoring_logs (user_id, created_at desc);

create index if not exists idx_cv_tailoring_logs_cv_id
    on public.cv_tailoring_logs (cv_id);

create index if not exists idx_cv_tailoring_logs_opportunity_id
    on public.cv_tailoring_logs (opportunity_id);

alter table public.cv_exports enable row level security;
alter table public.cv_tailoring_logs enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'cv_exports'
          and policyname = 'Users can view own cv exports'
    ) then
        create policy "Users can view own cv exports"
            on public.cv_exports
            for select
            using (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'cv_exports'
          and policyname = 'Users can insert own cv exports'
    ) then
        create policy "Users can insert own cv exports"
            on public.cv_exports
            for insert
            with check (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'cv_tailoring_logs'
          and policyname = 'Users can view own cv tailoring logs'
    ) then
        create policy "Users can view own cv tailoring logs"
            on public.cv_tailoring_logs
            for select
            using (auth.uid() = user_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'cv_tailoring_logs'
          and policyname = 'Users can insert own cv tailoring logs'
    ) then
        create policy "Users can insert own cv tailoring logs"
            on public.cv_tailoring_logs
            for insert
            with check (auth.uid() = user_id);
    end if;
end $$;
