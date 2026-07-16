-- The Needs Review card said 231 while only 5 rows actually awaited review.
--
-- The 20260715090000 version of this function counted any row whose
-- metadata still carries needs_review='true'. That flag lingers after an
-- opportunity is approved, rejected, or closed (approval flips status but
-- never clears the flag), so the card counted hundreds of already-handled
-- rows and made the stat cards impossible to reconcile with Total.
--
-- The TS fallback in OpportunitiesService.getAdminStats() already guards the
-- flag with `status not in ('active','rejected','closed')`; this brings the
-- RPC back in line with it. Keep the two definitions identical.
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
         or (
           coalesce(metadata->>'needs_review', 'false') = 'true'
           and status not in ('active', 'rejected', 'closed')
         )
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
