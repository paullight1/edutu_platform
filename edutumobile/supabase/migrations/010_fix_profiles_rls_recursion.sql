-- Fix recursive profile policies that can trigger:
-- "infinite recursion detected in policy for relation \"profiles\"".
--
-- The mobile app reads profile fields such as creator_status, role, credits, and
-- billing flags directly. Any policy on profiles that queries profiles again
-- can recursively invoke itself, so reset the table to non-recursive policies.

alter table public.profiles enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end $$;

create policy "Profiles are readable"
  on public.profiles
  for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid()::text = user_id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Service role can manage profiles"
  on public.profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
