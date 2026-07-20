-- Distinguish estimated token counts from provider-reported ones on the cost
-- table itself. Before this, a stream whose provider dropped the final usage
-- frame logged length-estimated tokens (and therefore an estimated cost) that
-- were indistinguishable from measured ones in every finance query — the
-- "estimated" marker only reached ai_usage_logs.request_metadata.
--
-- NULL = provider-reported (the overwhelming majority, and the default, so no
-- backfill is needed and no existing query changes meaning).
-- 'estimated' = derived from character length; treat the cost as approximate.
alter table public.ai_usage_events
  add column if not exists token_source text;

-- No index on token_source. A partial index `where token_source is not null`
-- was considered and rejected: the finance query this column exists for is
-- `where token_source is null` (see schema.ts) to get measured-only spend,
-- and a `not null` partial index cannot serve a `is null` predicate — it
-- would only speed up the rare `= 'estimated'` lookup, which a seq scan over
-- the ~1% non-null population already handles fine. A non-concurrent
-- `create index` on this table would also hold a SHARE lock for the full
-- build, blocking every in-request INSERT into this append-per-AI-call
-- table for no offsetting benefit.
