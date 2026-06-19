-- Prevent clients from self-promoting or editing protected account state through the Data API.
-- RLS still controls row ownership; these column grants limit which profile fields public clients can write.

revoke insert, update, delete, truncate on table public.profiles from anon;
revoke insert, update, delete, truncate on table public.profiles from authenticated;

-- Authenticated users may create their own basic profile, but cannot set role/admin, credits,
-- subscription/pro, or creator-review state during insert.
grant insert (
  user_id,
  email,
  full_name,
  age,
  avatar_url,
  bio,
  preferences,
  last_seen_at,
  school,
  country,
  major,
  cgpa,
  grad_year,
  degree,
  cv_trial_used
) on table public.profiles to authenticated;

-- Authenticated users may edit normal profile fields only. Protected operational fields are
-- owned by the backend service role and admin flows.
grant update (
  email,
  full_name,
  age,
  avatar_url,
  bio,
  preferences,
  last_seen_at,
  updated_at,
  school,
  country,
  major,
  cgpa,
  grad_year,
  degree,
  cv_trial_used
) on table public.profiles to authenticated;

grant insert, update, delete, truncate on table public.profiles to service_role;
