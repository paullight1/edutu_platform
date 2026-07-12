-- Signal ledger expansion (Phase 1 of the world-class recs plan).
--
-- 1. opportunity_id becomes nullable: new non-item signal types (search,
--    category_view) carry their payload in details ({query} / {category})
--    and have no opportunity to reference.
-- 2. (user_id, signal_type) composite index: impression-fatigue and
--    per-type aggregations filter on both columns together.

alter table public.user_opportunity_signals
  alter column opportunity_id drop not null;

comment on column public.user_opportunity_signals.opportunity_id is
  'Null for non-item signals (search, category_view); details carries {query}/{category}.';

create index if not exists idx_user_signals_user_type
  on public.user_opportunity_signals (user_id, signal_type);
