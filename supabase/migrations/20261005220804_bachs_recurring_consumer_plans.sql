-- Web consumer subscriptions. Deployment product IDs are supplied separately.
begin;

alter table public.billing_provider_subscriptions
  add column if not exists checkout_intent_id uuid
    references public.billing_checkout_intents(id);
create unique index if not exists billing_subscription_checkout_unique
  on public.billing_provider_subscriptions(provider, environment, checkout_intent_id)
  where checkout_intent_id is not null;

update public.billing_products
set fulfillment_kind = 'subscription', renewal_mode = 'recurring',
    entitlement_duration = null,
    payment_method_policy = '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb,
    expected_amount_minor = case when product_key = 'lite_yearly_pass'
      then 9999 else expected_amount_minor end,
    catalog_version = catalog_version + 1, updated_at = now()
where product_key in (
  'lite_weekly_pass', 'lite_monthly_pass', 'lite_yearly_pass',
  'pro_weekly_pass', 'pro_monthly_pass', 'pro_yearly_pass',
  'scholar_weekly_pass', 'scholar_monthly_pass', 'scholar_yearly_pass'
);

commit;
