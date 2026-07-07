-- Fix: users could edit + save their profile but it always came back empty.
--
-- Rows in profiles (and other uuid-keyed tables) are keyed by a deterministic
-- FNV-1a-derived synthetic uuid of the Clerk id (mobile toSafeUUID ==
-- backend toDatabaseUserId), but the RLS helper current_app_user_id() returns
-- the RAW Clerk sub ("user_..."). The policies compared them directly, so a
-- signed-in client could never select or update its own profile row: reads
-- returned nothing (empty stats/tags) and writes matched zero rows silently.
--
-- clerk_id_to_uuid() is an exact SQL port of the app's mapping (verified
-- byte-for-byte against toSafeUUID for real Clerk ids). Policies now accept
-- BOTH keyings: raw sub (goals/bookmarks style) and the derived uuid
-- (profiles/backend style).
--
-- APPLIED to production via Supabase MCP on 2026-07-07.

create or replace function public.clerk_id_to_uuid(p_id text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  seeds bigint[] := array[x'811c9dc5'::bigint, x'9e3779b9'::bigint, x'85ebca6b'::bigint, x'c2b2ae35'::bigint];
  h bigint;
  hex_all text := '';
  i int; j int;
begin
  if p_id is null or btrim(p_id) = '' then
    return null;
  end if;
  -- Already a uuid: normalized pass-through (same as the app helpers).
  if p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return lower(p_id);
  end if;
  for j in 1..4 loop
    h := seeds[j];
    for i in 1..length(p_id) loop
      h := h # ascii(substr(p_id, i, 1));
      h := (h * 16777619) % 4294967296;
    end loop;
    hex_all := hex_all || lpad(to_hex(h), 8, '0');
  end loop;
  return substr(hex_all,1,8) || '-' || substr(hex_all,9,4)
    || '-4' || substr(hex_all,14,3)
    || '-a' || substr(hex_all,18,3)
    || '-' || substr(hex_all,21,12);
end $$;

revoke all on function public.clerk_id_to_uuid(text) from anon;
grant execute on function public.clerk_id_to_uuid(text) to authenticated, service_role;

-- The caller's identity in BOTH accepted keyings.
create or replace function public.current_app_user_uuid()
returns text
language sql
stable
set search_path = ''
as $$
  select public.clerk_id_to_uuid(public.current_app_user_id())
$$;

revoke all on function public.current_app_user_uuid() from anon;
grant execute on function public.current_app_user_uuid() to authenticated, service_role;

-- profiles: user_id is text holding the derived uuid (backend-created rows).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
    or (select auth.role()) = 'service_role'
    or (select private.current_app_is_admin())
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
  ) with check (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
  );

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
  );

-- user_opportunity_preferences: same dual-keying fix.
drop policy if exists "user_opportunity_preferences_rw" on public.user_opportunity_preferences;
create policy "user_opportunity_preferences_rw" on public.user_opportunity_preferences
  for all using (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
    or (select private.current_app_is_admin())
  ) with check (
    (select public.current_app_user_id()) = user_id
    or (select public.current_app_user_uuid()) = user_id
    or (select private.current_app_is_admin())
  );
