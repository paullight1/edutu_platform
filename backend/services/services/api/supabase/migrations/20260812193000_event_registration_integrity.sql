-- A learner can hold at most one registration per event. These partial
-- indexes preserve the public API's support for either email or user_id while
-- allowing anonymous values to remain absent rather than treating NULLs as a
-- shared identity. Email uniqueness is case-insensitive to match join input
-- normalization in the API.
create unique index if not exists event_registrations_event_user_unique
  on public.event_registrations (event_id, user_id)
  where user_id is not null;

create unique index if not exists event_registrations_event_email_ci_unique
  on public.event_registrations (event_id, lower(email))
  where email is not null;
