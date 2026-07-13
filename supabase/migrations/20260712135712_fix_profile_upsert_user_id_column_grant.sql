-- Client profile saves were failing with 42501 "permission denied for table
-- profiles": PostgREST upserts put every payload column — including the
-- ON CONFLICT target — into the DO UPDATE SET list, so the column-level grant
-- model from 20260619140744 needs UPDATE(user_id) even though the value never
-- changes. RLS (USING + WITH CHECK pin user_id to the caller) still prevents
-- moving a row to another user, and privileged columns stay non-writable.
grant update (user_id) on table public.profiles to authenticated;
