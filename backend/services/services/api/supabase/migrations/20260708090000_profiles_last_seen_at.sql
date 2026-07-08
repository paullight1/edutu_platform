-- Active-user tracking: every authenticated request stamps
-- profiles.last_seen_at (throttled in ClerkAuthGuard). The web admin
-- "active this week" metric reads this column; before this it was never
-- written for Clerk/Google logins, so activeThisWeek was always 0.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- The admin metric filters on recency; keep it indexed at scale.
create index if not exists idx_profiles_last_seen_at
  on public.profiles (last_seen_at desc)
  where last_seen_at is not null;
