-- Keep profile creation compatible with existing clients that send timestamps,
-- while keeping operational state out of direct client writes.

grant insert (created_at, updated_at) on table public.profiles to authenticated;
revoke insert (cv_trial_used) on table public.profiles from authenticated;
revoke update (cv_trial_used) on table public.profiles from authenticated;
