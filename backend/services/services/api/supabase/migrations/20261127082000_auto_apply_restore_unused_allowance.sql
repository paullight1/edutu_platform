begin;

-- Legacy runs have no recorded charge month. Preserve their existing accounting.
alter table private.auto_apply_attempts
  add column allowance_month date,
  add column has_usable_progress boolean not null default true;
alter table private.auto_apply_attempts
  alter column allowance_month set default date_trunc('month', now() at time zone 'UTC')::date,
  alter column has_usable_progress set default false;

create function private.restore_unused_auto_apply_allowance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.state in ('needs_input', 'needs_review', 'submitting', 'unconfirmed', 'submitted') then
    new.has_usable_progress := true;
  elsif old.state = 'running' and new.state = 'failed'
     and (new.failure_reason is null or new.failure_reason in ('mapping_changed', 'provider_busy', 'provider_unavailable'))
     and not old.has_usable_progress and old.allowance_month is not null then
    update private.auto_apply_usage
       set attempts = attempts - 1
     where user_id = old.owner_id and month_start = old.allowance_month and attempts > 0;
    if found then new.allowance_month := null; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.restore_unused_auto_apply_allowance() from public;

create trigger restore_unused_auto_apply_allowance
before update of state on private.auto_apply_attempts
for each row when (old.state is distinct from new.state)
execute function private.restore_unused_auto_apply_allowance();

create function private.retry_refunded_auto_apply(
  attempt_id uuid, expected_version integer, owner text, legacy_owner text, pilot_ids text[], billing_tier text
)
returns table(id uuid, state text, version integer) language plpgsql set search_path = '' as $$
declare
  month_key date := date_trunc('month', now() at time zone 'UTC')::date;
  allowance integer;
  charge_owner text;
begin
  select attempt.owner_id into charge_owner
  from private.auto_apply_attempts attempt
  join public.opportunity_applications application on application.id = attempt.application_id
  join public.opportunities opportunity on opportunity.id = application.opportunity_id
  where attempt.id = attempt_id and attempt.version = expected_version
    and attempt.state = 'failed' and not attempt.has_usable_progress and attempt.allowance_month is null
    and application.user_id in (owner, legacy_owner) and application.status = 'draft'
    and application.opportunity_id::text = any(pilot_ids) and private.auto_apply_block_reason(opportunity) is null
  for update of attempt;
  if not found then return; end if;

  allowance := private.auto_apply_limit(charge_owner, billing_tier);
  insert into private.auto_apply_usage(user_id, month_start, attempts) values(charge_owner, month_key, 1)
    on conflict(user_id, month_start) do update set attempts = auto_apply_usage.attempts + 1
    where auto_apply_usage.attempts < allowance;
  if not found then raise exception 'auto_apply_monthly_limit'; end if;

  return query
  update private.auto_apply_attempts attempt
    set state = 'queued', version = attempt.version + 1, allowance_month = month_key,
      failure_reason = null, lease_until = null, provider_retry_after = null, provider_busy_retries = 0
    where attempt.id = attempt_id
    returning attempt.id, attempt.state, attempt.version;
end;
$$;
revoke all on function private.retry_refunded_auto_apply(uuid, integer, text, text, text[], text) from public;

commit;
