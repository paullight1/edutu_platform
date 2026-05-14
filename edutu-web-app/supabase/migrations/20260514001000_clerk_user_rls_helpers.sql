-- Clerk-compatible RLS helpers.
-- Clerk JWTs use a text subject such as "user_..." rather than a Supabase UUID.
-- Policies should compare user_id columns with this helper instead of auth.uid().

create or replace function public.current_app_user_id()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'sub', ''), auth.uid()::text)
$$;

grant execute on function public.current_app_user_id() to anon, authenticated, service_role;

drop policy if exists "Users view own billing subscriptions" on public.billing_subscriptions;
create policy "Users view own billing subscriptions"
  on public.billing_subscriptions
  for select
  using (public.current_app_user_id() = user_id);

drop policy if exists "Users view own billing entitlements" on public.billing_entitlements;
create policy "Users view own billing entitlements"
  on public.billing_entitlements
  for select
  using (public.current_app_user_id() = user_id);

drop policy if exists "Users view own billing transactions" on public.billing_transactions;
create policy "Users view own billing transactions"
  on public.billing_transactions
  for select
  using (public.current_app_user_id() = user_id);
