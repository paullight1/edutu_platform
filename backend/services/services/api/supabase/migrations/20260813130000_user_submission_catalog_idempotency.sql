-- Task 8: one catalog row per approved user submission.
-- The provenance key is server-written metadata, never user-controlled.
create unique index if not exists opportunities_user_submission_id_unique
  on public.opportunities ((metadata ->> 'submission_id'))
  where source = 'user_submission'
    and metadata ->> 'submission_id' is not null;
