-- Migration: Opportunity personalization bank
-- Adds persistent preference and signal tables for AI-driven recommendations.

create table if not exists public.user_opportunity_preferences (
    user_id uuid primary key,
    preferred_categories text[],
    preferred_regions text[],
    preferred_funding_types text[],
    preferred_opportunity_types text[],
    preferred_skills text[],
    excluded_categories text[],
    remote_only boolean default false,
    max_deadline_days integer,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.user_opportunity_signals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    opportunity_id uuid not null references public.opportunities(id) on delete cascade,
    signal_type text not null,
    signal_value integer default 1,
    source text default 'app',
    context text,
    details jsonb,
    created_at timestamp with time zone default now()
);

create index if not exists user_opportunity_signals_user_id_idx
    on public.user_opportunity_signals(user_id, created_at desc);

create index if not exists user_opportunity_signals_opportunity_id_idx
    on public.user_opportunity_signals(opportunity_id, created_at desc);

alter table public.user_opportunity_preferences enable row level security;
alter table public.user_opportunity_signals enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_opportunity_preferences'
          and policyname = 'Enable authenticated read access on preferences'
    ) then
        create policy "Enable authenticated read access on preferences"
        on public.user_opportunity_preferences
        for select
        using (auth.role() = 'authenticated');
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_opportunity_preferences'
          and policyname = 'Enable service role access on preferences'
    ) then
        create policy "Enable service role access on preferences"
        on public.user_opportunity_preferences
        for all
        using (true)
        with check (true);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_opportunity_signals'
          and policyname = 'Enable authenticated read access on signals'
    ) then
        create policy "Enable authenticated read access on signals"
        on public.user_opportunity_signals
        for select
        using (auth.role() = 'authenticated');
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_opportunity_signals'
          and policyname = 'Enable service role access on signals'
    ) then
        create policy "Enable service role access on signals"
        on public.user_opportunity_signals
        for all
        using (true)
        with check (true);
    end if;
end $$;
