begin;

alter table private.auto_apply_profiles add column education jsonb;

create function private.auto_apply_saved_education(owner_id text, legacy_owner_id text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'school', left(btrim(coalesce(profile.school, '')), 160),
      'degree', left(btrim(coalesce(profile.degree, '')), 160),
      'major', left(btrim(coalesce(profile.major, '')), 160),
      'graduationYear', case when profile.grad_year between 1000 and 9999
        then profile.grad_year::text else '' end
    )
    from public.profiles profile
    where profile.user_id in (owner_id, legacy_owner_id)
    order by (profile.user_id = owner_id) desc
    limit 1
  ), '{}'::jsonb);
$$;
revoke all on function private.auto_apply_saved_education(text, text) from public;

create or replace function private.auto_apply_has_profile(owner_id text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select from private.auto_apply_profiles profile
    where profile.user_id = owner_id and (
      profile.background <> '' or profile.statement <> '' or exists (
        select from jsonb_each_text(coalesce(profile.education, '{}'::jsonb)) field
        where field.value <> ''
      )
    )
  );
$$;

create or replace function private.start_auto_apply(owner_id text, tracker_id uuid, billing_tier text, legacy_owner_id text, pilot_ids text[], selected_cv jsonb default null)
returns uuid language plpgsql set search_path = '' as $$
declare
  month_key date := date_trunc('month', now() at time zone 'UTC')::date;
  attempt_id uuid;
  tracker_status text;
  opportunity uuid;
  allowance integer;
  block_reason text;
  saved_profile jsonb;
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
  select private.auto_apply_block_reason(o) into block_reason from public.opportunities o where o.id = opportunity;
  if not found then raise exception 'auto_apply_opportunity_closed'; end if;
  if block_reason = 'applicant_only' then raise exception 'auto_apply_applicant_only'; end if;
  if block_reason is not null then raise exception 'auto_apply_opportunity_closed'; end if;
  select jsonb_build_object('background', profile.background, 'statement', profile.statement,
    'contact_name', profile.contact_name, 'contact_email', profile.contact_email,
    'education', coalesce(profile.education, private.auto_apply_saved_education(owner_id, legacy_owner_id)))
    into saved_profile
    from private.auto_apply_profiles profile
    where profile.user_id = owner_id and private.auto_apply_has_profile(owner_id);
  if not found then
    raise exception 'auto_apply_profile_required';
  end if;
  allowance := private.auto_apply_limit(owner_id, billing_tier);
  insert into private.auto_apply_usage(user_id, month_start, attempts) values(owner_id, month_key, 1)
    on conflict(user_id, month_start) do update set attempts = auto_apply_usage.attempts + 1
      where auto_apply_usage.attempts < allowance;
  if not found then raise exception 'auto_apply_monthly_limit'; end if;
  insert into private.auto_apply_attempts(application_id, owner_id, cv_snapshot, profile_snapshot)
    values(tracker_id, owner_id, selected_cv, saved_profile) returning id into attempt_id;
  return attempt_id;
end;
$$;

commit;
