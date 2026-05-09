-- Migration: Performance indexes and stats function
-- Adds database indexes for frequently queried columns
-- and an aggregation function for opportunity stats

-- Indexes for opportunities table
create index if not exists idx_opportunities_status
    on public.opportunities(status);

create index if not exists idx_opportunities_category
    on public.opportunities(category);

create index if not exists idx_opportunities_type
    on public.opportunities(type);

create index if not exists idx_opportunities_deadline
    on public.opportunities(deadline);

create index if not exists idx_opportunities_created_at
    on public.opportunities(created_at);

-- Indexes for user_opportunity_signals
create index if not exists idx_user_signals_user_id
    on public.user_opportunity_signals(user_id);

create index if not exists idx_user_signals_opportunity_id
    on public.user_opportunity_signals(opportunity_id);

create index if not exists idx_user_signals_type
    on public.user_opportunity_signals(signal_type);

-- Indexes for goals
create index if not exists idx_goals_user_id
    on public.goals(user_id);

create index if not exists idx_goals_status
    on public.goals(status);

-- Indexes for flashcard_reviews
create index if not exists idx_flashcard_reviews_user_id
    on public.flashcard_reviews(user_id);

create index if not exists idx_flashcard_reviews_card_id
    on public.flashcard_reviews(card_id);

create index if not exists idx_flashcard_reviews_next_review
    on public.flashcard_reviews(next_review_at);

-- Aggregation function for fast stats (replaces N+1 query)
create or replace function public.count_opportunities_by_source()
returns table(source text, count bigint)
language sql
security definer
as $$
    select
        coalesce(source, 'manual') as source,
        count(*)::bigint as count
    from public.opportunities
    group by source
    order by count desc;
$$;

-- Grant execute to authenticated users
grant execute on function public.count_opportunities_by_source() to authenticated;
grant execute on function public.count_opportunities_by_source() to anon;
