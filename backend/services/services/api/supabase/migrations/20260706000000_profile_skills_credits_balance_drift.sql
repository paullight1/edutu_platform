-- Schema-drift repair: the Drizzle schema (src/db/schema.ts) selects
-- profiles.skills and profiles.credits_balance, but no prior migration ever
-- created them. On databases provisioned before this fix, every profile SELECT
-- referenced non-existent columns and failed with a 42703, surfacing as a 500
-- on GET /profile (and any authed route that reads a profile).
--
-- credits_balance is the canonical in-app credit column used by the NestJS
-- backend (billing/admin). The legacy `credits` column is left in place for any
-- older Supabase RPCs; we backfill the new column from it so no balance is lost.

alter table if exists public.profiles
  add column if not exists skills text[],
  add column if not exists credits_balance integer not null default 0;

update public.profiles
set credits_balance = coalesce(credits, 0)
where coalesce(credits, 0) <> credits_balance;
