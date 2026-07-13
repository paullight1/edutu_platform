-- Merge fragmented profile rows onto the canonical raw Clerk id.
--
-- Background: `public.profiles.user_id` is text and was being written under TWO
-- different keys for the same user:
--   * raw auth subject  (e.g. `user_3GLV…`) — mobile app + web `authService`
--   * derived uuid       (clerk_id_to_uuid(sub)) — older backend `/profile` paths
-- so a user's data could split across two rows and neither surface showed the
-- full profile. The backend now keys `profiles` by the raw auth subject
-- (matching mobile + web), so this migration folds every orphaned derived-uuid
-- row into its raw-id counterpart and removes the duplicate.
--
-- Idempotent: after it runs there are no derived rows left with a matching raw
-- row, so re-running is a no-op. uuid-keyed rows with no matching raw row are
-- genuine Supabase-auth accounts and are left untouched.

begin;

-- 1) Fold the derived row's values into the canonical raw-id row.
--    Descriptive fields prefer the derived row (that is where web onboarding
--    collected them); credits/pro use loss-free combiners.
update public.profiles r
set
  full_name            = coalesce(d.full_name, r.full_name),
  email                = coalesce(d.email, r.email),
  country              = coalesce(d.country, r.country),
  major                = coalesce(d.major, r.major),
  degree               = coalesce(d.degree, r.degree),
  cgpa                 = coalesce(d.cgpa, r.cgpa),
  grad_year            = coalesce(d.grad_year, r.grad_year),
  date_of_birth        = coalesce(d.date_of_birth, r.date_of_birth),
  age                  = coalesce(d.age, r.age),
  interested_countries = coalesce(d.interested_countries, r.interested_countries),
  interests            = coalesce(d.interests, r.interests),
  skills               = coalesce(d.skills, r.skills),
  avatar_url           = coalesce(d.avatar_url, r.avatar_url),
  bio                  = coalesce(d.bio, r.bio),
  timezone             = coalesce(d.timezone, r.timezone),
  credits              = greatest(coalesce(r.credits, 0), coalesce(d.credits, 0)),
  is_pro               = coalesce(r.is_pro, false) or coalesce(d.is_pro, false),
  pro_since            = least(r.pro_since, d.pro_since),
  pro_expires_at       = greatest(r.pro_expires_at, d.pro_expires_at),
  subscription_id      = coalesce(r.subscription_id, d.subscription_id),
  role                 = case when r.role <> 'user' then r.role
                              when d.role <> 'user' then d.role else 'user' end,
  creator_status       = case when r.creator_status <> 'none' then r.creator_status
                              else d.creator_status end,
  mentor_status        = case when r.mentor_status <> 'none' then r.mentor_status
                              else d.mentor_status end,
  preferences          = case when d.preferences is not null and d.preferences <> '{}'::jsonb
                              then d.preferences else r.preferences end,
  settings             = case when d.settings is not null and d.settings <> '{}'::jsonb
                              then d.settings else r.settings end,
  last_seen_at         = greatest(r.last_seen_at, d.last_seen_at),
  created_at           = least(r.created_at, d.created_at),
  updated_at           = now()
from public.profiles d
where r.user_id ~ '^user_'
  and d.user_id = public.clerk_id_to_uuid(r.user_id)
  and d.user_id <> r.user_id;

-- 2) Drop the now-merged derived rows.
delete from public.profiles d
where exists (
  select 1 from public.profiles r
  where r.user_id ~ '^user_'
    and public.clerk_id_to_uuid(r.user_id) = d.user_id
    and r.user_id <> d.user_id
);

commit;
