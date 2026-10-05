-- RevenueCat and Bachs reconciliation can attach the provider's charge or
-- transaction reference to its durable event inbox row.
-- The canonical pay-shell tables are created in
-- 20261002090000_billing_pay_shell_sessions.sql.

begin;

alter table public.billing_provider_events
  add column if not exists provider_reference text;

create index if not exists billing_provider_events_provider_reference_idx
  on public.billing_provider_events (provider, environment, provider_reference)
  where provider_reference is not null;

commit;
