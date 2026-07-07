-- Reconcile api_consumers with the application schema (src/db/schema.ts).
--
-- The original 20260522010000_edutu_api_consumers.sql migration created a
-- narrower table than the one the developer portal (src/developer) and the
-- public API key guard (src/edutu-api) expect. The extra columns were only
-- ever applied ad-hoc via `drizzle-kit push`, so tracked-migration-only
-- environments (including production) are missing them, which breaks:
--   - POST /developer/projects (inserts owner_user_id, key_prefix, environment,
--     rate_limit_per_minute)
--   - EdutuApiKeyGuard.resolveConsumer (selects key_prefix, revoked_at,
--     expires_at, rate_limit_per_minute; updates last_used_at)
-- All changes are additive and idempotent.

alter table public.api_consumers
  add column if not exists owner_user_id uuid,
  add column if not exists key_prefix text,
  add column if not exists environment text not null default 'live',
  add column if not exists rate_limit_per_minute integer default 60,
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists expires_at timestamptz;

create index if not exists idx_api_consumers_owner
  on public.api_consumers (owner_user_id);
create index if not exists idx_api_consumers_status
  on public.api_consumers (status);
create index if not exists idx_api_consumers_key_hash
  on public.api_consumers (api_key_hash);
-- Unique so the guard's prefix lookup resolves to a bounded candidate set.
-- Multiple NULL prefixes (legacy env-provisioned rows) remain allowed.
create unique index if not exists idx_api_consumers_key_prefix_unique
  on public.api_consumers (key_prefix);
