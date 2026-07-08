-- Canonicalize opportunities.status vocabulary.
-- The admin UI, stats queries, and review pipeline key on
-- pending_review/active/draft/closed/rejected, but older writers persisted
-- 'pending' and 'expired' — rows the admin "Needs Review"/"Closed" filters
-- could never match. Backend writers are canonical as of this change;
-- migrate the stragglers and fix the column default.

update public.opportunities
  set status = 'closed'
  where status = 'expired';

update public.opportunities
  set status = 'pending_review'
  where status = 'pending';

alter table public.opportunities
  alter column status set default 'pending_review';
