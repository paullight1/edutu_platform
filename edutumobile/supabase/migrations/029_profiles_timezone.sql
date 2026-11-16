-- IANA timezone (e.g. 'Africa/Lagos') synced from the device on app start.
-- Used by the proactive alert engine to honor quiet hours in the user's local
-- time instead of assuming UTC.
-- (Applied live via Supabase MCP on 2026-07-12 as add_profiles_timezone.)

alter table public.profiles add column if not exists timezone text;
