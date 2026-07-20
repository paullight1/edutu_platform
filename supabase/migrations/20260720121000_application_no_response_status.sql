-- Adds a terminal `no_response` status to opportunity_applications so users can
-- close out ghosted applications on their own terms (the org never replied).
-- Recorded as an `outcome_ghosted` signal by the API; never celebrated.
alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_status_check;

alter table public.opportunity_applications
  add constraint opportunity_applications_status_check
  check (status in ('draft','submitted','interview','offer','rejected','withdrawn','no_response'));
