begin;
-- ALU requires applicants to complete and submit their own applications.
-- Source: https://www.alueducation.com/apply-now/
create function private.auto_apply_block_reason(listing public.opportunities)
returns text language sql stable set search_path = '' as $$
  select case
    when not coalesce(private.auto_apply_listing_open(listing), false) then 'opportunity_closed'
    when exists (
      select 1 from unnest(array[(listing).application_url, (listing).apply_url]) url
      where lower(btrim(url)) ~ '^https://(([a-z0-9-]+[.])*alueducation[.]com|alueducation[.]formtitan[.]com)([/:?#]|$)'
    ) then 'applicant_only'
  end;
$$;
revoke all on function private.auto_apply_block_reason(public.opportunities) from public;

create or replace function private.start_auto_apply(owner_id text, tracker_id uuid, billing_tier text, legacy_owner_id text, pilot_ids text[], selected_cv jsonb default null)
returns uuid language plpgsql as $$
declare
  month_key date := date_trunc('month', now() at time zone 'UTC')::date;
  attempt_id uuid;
  tracker_status text;
  opportunity uuid;
  allowance integer;
  block_reason text;
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

create or replace function private.queue_auto_apply_action()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner_id text;
  opportunity_id uuid;
  opportunity_title text;
begin
  if new.state not in ('needs_input', 'needs_review', 'unconfirmed', 'failed') then return new; end if;
  if tg_op = 'UPDATE' and old.state = new.state
      and (new.state = 'needs_review' or old.version = new.version) then return new; end if;
  select a.user_id, a.opportunity_id, left(o.title, 120) into strict owner_id, opportunity_id, opportunity_title
    from public.opportunity_applications a
    left join public.opportunities o on o.id = a.opportunity_id
    where a.id = new.application_id;

  insert into public.notification_queue (payload, scheduled_for, created_by)
  values (jsonb_build_object(
    'title', case new.state
      when 'needs_input' then 'Auto Apply needs your help'
      when 'needs_review' then 'Review your application'
      when 'failed' then case new.failure_reason
        when 'opportunity_closed' then 'This opportunity has closed'
        when 'applicant_only' then 'Apply on the provider’s website'
        else 'Auto Apply could not continue' end
      else 'Check your application submission'
    end,
    'body', case new.state
      when 'needs_input' then coalesce(opportunity_title, 'Your application') ||
        case when new.handoff_required then ' needs your attention on the provider’s website.' else ' needs an answer to continue.' end
      when 'needs_review' then coalesce(opportunity_title, 'Your application') || ' is ready for you to review.'
      when 'failed' then case new.failure_reason
        when 'opportunity_closed' then coalesce(opportunity_title, 'This opportunity') || ' has closed. Open the application for its status.'
        when 'applicant_only' then 'Complete and submit your own application for ' || coalesce(opportunity_title, 'this opportunity') || ' on the provider’s website.'
        else 'Open your application for ' || coalesce(opportunity_title, 'this opportunity') || ' to retry or check what happened.' end
      else 'Check the provider for a receipt for ' || coalesce(opportunity_title, 'your application') || '.'
    end,
    'kind', 'application-status', 'severity', 'info', 'audience', 'specific',
    'targetUserIds', jsonb_build_array(owner_id),
    'channels', jsonb_build_object('inApp', true, 'push', true, 'email', false),
    'dedupeKey', 'auto-apply:' || new.id::text || ':' || new.version::text || ':' || new.state,
    'metadata', jsonb_build_object('attemptId', new.id, 'opportunityId', opportunity_id,
      'source', 'auto-apply-action', 'state', new.state, 'attemptVersion', new.version, 'url', '/auto-apply/' || new.id::text)
  ), now(), null)
  on conflict do nothing;
  return new;
end;
$$;
commit;
