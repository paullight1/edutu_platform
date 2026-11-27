begin;
create schema if not exists private;
create table private.auto_apply_profiles (
  user_id text primary key,
  background text not null,
  statement text not null,
  version integer not null default 1
);
create table private.auto_apply_plan_limits (
  plan_tier text primary key,
  monthly_limit integer not null check (monthly_limit >= 3)
);
create table private.auto_apply_user_limits (
  user_id text primary key,
  monthly_limit integer not null check (monthly_limit >= 3)
);
create table private.auto_apply_usage (
  user_id text not null,
  month_start date not null,
  attempts integer not null check (attempts >= 0),
  primary key (user_id, month_start)
);
create table private.auto_apply_attempts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.opportunity_applications(id) on delete cascade,
  owner_id text not null,
  cv_snapshot jsonb,
  state text not null default 'queued' check (state in
    ('queued','running','needs_input','needs_review','submitting','unconfirmed','submitted','cancelled','failed')),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create function private.auto_apply_limit(owner_id text, billing_tier text)
returns integer language sql stable as $$
  select greatest(3,
    (select monthly_limit from private.auto_apply_plan_limits where plan_tier = billing_tier),
    (select monthly_limit from private.auto_apply_user_limits where user_id = public.clerk_id_to_uuid(owner_id)));
$$;
revoke all on function private.auto_apply_limit(text,text) from public;
create function private.auto_apply_has_profile(owner_id text)
returns boolean language sql stable as $$
  select exists (
    select from private.auto_apply_profiles
    where user_id = owner_id and (background <> '' or statement <> '')
  );
$$;
revoke all on function private.auto_apply_has_profile(text) from public;
-- Only the backend supplies the tracker owner and verified billing tier.
create function private.start_auto_apply(owner_id text, tracker_id uuid, billing_tier text, legacy_owner_id text, pilot_ids text[], selected_cv jsonb default null)
returns uuid language plpgsql as $$
declare
  month_key date := date_trunc('month', now() at time zone 'UTC')::date;
  attempt_id uuid;
  tracker_status text;
  opportunity uuid;
  allowance integer;
begin
  select status, opportunity_id into tracker_status, opportunity from public.opportunity_applications
    where id = tracker_id and user_id in (owner_id, legacy_owner_id) for update;
  if not found then raise exception 'application_not_found'; end if;
  select id into attempt_id from private.auto_apply_attempts where application_id = tracker_id;
  if found then return attempt_id; end if;
  if not coalesce(opportunity::text = any(pilot_ids), false) then
    raise exception 'auto_apply_unavailable';
  end if;
  if tracker_status <> 'draft' then raise exception 'application_already_progressed'; end if;
  if not private.auto_apply_has_profile(owner_id) then
    raise exception 'auto_apply_profile_required';
  end if;
  allowance := private.auto_apply_limit(owner_id, billing_tier);
  insert into private.auto_apply_usage(user_id, month_start, attempts) values(owner_id, month_key, 1)
    on conflict(user_id, month_start) do update set attempts = auto_apply_usage.attempts + 1
      where auto_apply_usage.attempts < allowance;
  if not found then raise exception 'auto_apply_monthly_limit'; end if;
  insert into private.auto_apply_attempts(application_id, owner_id, cv_snapshot) values(tracker_id, owner_id, selected_cv) returning id into attempt_id;
  return attempt_id;
end;
$$;
revoke all on function private.start_auto_apply(text, uuid, text, text, text[], jsonb) from public;
commit;
