-- Tighten the canonical 20261002090000 pay-shell rows: account handoffs must
-- not carry an intent, and all codes/sessions must expire after creation.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_pay_shell_codes'::regclass
      and conname = 'billing_pay_shell_codes_account_intent_check'
  ) then
    if exists (
      select 1 from public.billing_pay_shell_codes
      where (destination = 'account') is distinct from (intent_id is null)
    ) then
      raise exception 'Cannot harden pay-shell codes: account destination and intent id conflict.';
    end if;
    alter table public.billing_pay_shell_codes
      add constraint billing_pay_shell_codes_account_intent_check
      check ((destination = 'account') = (intent_id is null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_pay_shell_codes'::regclass
      and conname = 'billing_pay_shell_codes_expiry_order_check'
  ) then
    if exists (
      select 1 from public.billing_pay_shell_codes
      where expires_at <= created_at
    ) then
      raise exception 'Cannot harden pay-shell codes: expiry is not after creation.';
    end if;
    alter table public.billing_pay_shell_codes
      add constraint billing_pay_shell_codes_expiry_order_check
      check (expires_at > created_at);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_pay_shell_sessions'::regclass
      and conname = 'billing_pay_shell_sessions_account_intent_check'
  ) then
    if exists (
      select 1 from public.billing_pay_shell_sessions
      where (destination = 'account') is distinct from (intent_id is null)
    ) then
      raise exception 'Cannot harden pay-shell sessions: account destination and intent id conflict.';
    end if;
    alter table public.billing_pay_shell_sessions
      add constraint billing_pay_shell_sessions_account_intent_check
      check ((destination = 'account') = (intent_id is null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_pay_shell_sessions'::regclass
      and conname = 'billing_pay_shell_sessions_expiry_order_check'
  ) then
    if exists (
      select 1 from public.billing_pay_shell_sessions
      where expires_at <= created_at
    ) then
      raise exception 'Cannot harden pay-shell sessions: expiry is not after creation.';
    end if;
    alter table public.billing_pay_shell_sessions
      add constraint billing_pay_shell_sessions_expiry_order_check
      check (expires_at > created_at);
  end if;
end;
$$;

commit;
