-- Partial composite index for cross-user per-opportunity engagement aggregation
-- (hidden-gems surfacing queries GROUP BY opportunity_id over a 30-day window).
create index if not exists idx_user_opp_signals_opp_created
  on public.user_opportunity_signals (opportunity_id, created_at desc)
  where opportunity_id is not null;
