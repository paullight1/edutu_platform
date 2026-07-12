-- Deadline integrity: unify close_date/deadline, and queue every
-- deadline-closed opportunity for source re-verification so rows closed on
-- stale or year-inferred deadlines get re-opened by the verification job.

-- 1) close_date and deadline are meant to hold the same value, but rows
--    written by older code paths populated only one. Backfill both ways so
--    every reader (admin uses close_date, verification uses deadline) sees
--    the same truth.
update public.opportunities
set close_date = deadline
where close_date is null and deadline is not null;

update public.opportunities
set deadline = close_date
where deadline is null and close_date is not null;

-- 2) Existing closed/expired rows were closed purely on deadline < now(),
--    without checking the live page. Make them due for the new
--    verify-before-close pass, which re-reads the source and re-opens
--    anything whose page shows a future deadline.
update public.opportunities
set verification_next_check_at = now()
where status = 'closed'
  and duplicate_of is null;

-- 3) Mark rows that have no deadline at all so the UI can distinguish
--    "rolling" from "extraction failed" instead of a bare "No deadline".
update public.opportunities
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object('deadline_confidence', 'unknown')
where close_date is null
  and deadline is null
  and (metadata is null or metadata->>'deadline_confidence' is null);
