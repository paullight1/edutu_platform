-- Make the admin stat cards agree with the list beside them.
--
-- Two problems this fixes:
--
-- 1. 'active' counted `status = 'active'` literally, which includes rows whose
--    deadline has already passed. The hourly verification job flips those to
--    'closed' eventually, but until it runs the admin list renders them as
--    "Closed" (effectiveStatus() in Opportunities.tsx) while the Active card
--    counted them as open. The card contradicted the rows underneath it.
--
-- 2. There was no 'expired' count at all, so once the list started hiding
--    expired opportunities by default there was no way to see how many were
--    being withheld — "Total 514" next to a list of 354 with nothing to
--    explain the gap.
--
-- Also adds 'missingDeadline', which makes the deadline-recovery cohort
-- visible instead of something you have to know to go looking for.
--
-- Expiry here matches isExpiredOpportunity() on the client exactly:
-- status 'closed' OR a close_date in the past. Keep the two in step.
create or replace function public.opportunity_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*)::int,
    'active', count(*) filter (
      where status = 'active'
        and (close_date is null or close_date >= current_date)
    )::int,
    'expired', count(*) filter (
      where status = 'closed'
         or (close_date is not null and close_date < current_date)
    )::int,
    'missingDeadline', count(*) filter (
      where close_date is null and deadline is null
    )::int,
    'featured', count(*) filter (where is_featured = true)::int,
    'needsReview', count(*) filter (
      where status = 'pending_review'
         or coalesce(metadata->>'needs_review', 'false') = 'true'
    )::int,
    'expiringSoon', count(*) filter (
      where close_date is not null
        and close_date >= current_date
        and close_date <= current_date + interval '7 days'
    )::int
  )
  from public.opportunities;
$$;

grant execute on function public.opportunity_admin_stats() to authenticated;
grant execute on function public.opportunity_admin_stats() to service_role;
