begin;

-- Admin monetization operations are exposed through the Nest admin API. The
-- browser does not need direct Data API EXECUTE on these SECURITY DEFINER
-- functions, even though the function bodies also perform an admin check.
-- Removing authenticated execution gives a second authorization boundary and
-- prevents a future function-body regression from becoming a browser-level
-- privilege escalation.
revoke execute on function public.admin_grant_credits(
  text,
  integer,
  text,
  text,
  text
) from public;
revoke execute on function public.admin_grant_credits(
  text,
  integer,
  text,
  text,
  text
) from anon;
revoke execute on function public.admin_grant_credits(
  text,
  integer,
  text,
  text,
  text
) from authenticated;
grant execute on function public.admin_grant_credits(
  text,
  integer,
  text,
  text,
  text
) to service_role;

revoke execute on function public.admin_set_pro_status(
  text,
  boolean,
  timestamptz
) from public;
revoke execute on function public.admin_set_pro_status(
  text,
  boolean,
  timestamptz
) from anon;
revoke execute on function public.admin_set_pro_status(
  text,
  boolean,
  timestamptz
) from authenticated;
grant execute on function public.admin_set_pro_status(
  text,
  boolean,
  timestamptz
) to service_role;

-- spend_credits(amount, reason) is intentionally NOT changed here: it derives
-- the caller from the authenticated context and remains legitimate self-service.

commit;
