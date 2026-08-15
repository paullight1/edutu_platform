-- Edutu consumer subscription catalog.
--
-- Prices are USD major units in admin settings and USD minor units here:
-- Lite  $3.99 / $10 / $100
-- Pro   $5.00 / $15 / $150
-- Scholar $7.99 / $24.99 / $200
-- Products stay disabled until the matching live Bachs product IDs are
-- inserted into billing_product_provider_mappings and verified by ops.

begin;

insert into public.billing_products (
  product_key,
  fulfillment_kind,
  feature_key,
  renewal_mode,
  payment_method_policy,
  expected_amount_minor,
  currency,
  cadence,
  entitlement_duration,
  credit_quantity,
  enabled,
  catalog_version
)
values
  ('lite_weekly_pass', 'one_time_pass', 'lite', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    399, 'USD', 'weekly', interval '7 days', 0, false, 1),
  ('lite_monthly_pass', 'one_time_pass', 'lite', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    1000, 'USD', 'monthly', interval '31 days', 0, false, 1),
  ('lite_yearly_pass', 'one_time_pass', 'lite', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    10000, 'USD', 'yearly', interval '366 days', 0, false, 1),
  ('scholar_weekly_pass', 'one_time_pass', 'scholar', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    799, 'USD', 'weekly', interval '7 days', 0, false, 1),
  ('scholar_monthly_pass', 'one_time_pass', 'scholar', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    2499, 'USD', 'monthly', interval '31 days', 0, false, 1),
  ('scholar_yearly_pass', 'one_time_pass', 'scholar', 'one_time',
    '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb,
    20000, 'USD', 'yearly', interval '366 days', 0, false, 1)
on conflict (product_key) do nothing;

-- Align disabled legacy Pro pass placeholders with the approved launch prices.
-- Never overwrite a product that has already been enabled or mapped in live.
update public.billing_products product
set expected_amount_minor = case product.product_key
      when 'pro_weekly_pass' then 500
      when 'pro_monthly_pass' then 1500
      when 'pro_yearly_pass' then 15000
    end,
    currency = 'USD',
    entitlement_duration = case product.product_key
      when 'pro_weekly_pass' then interval '7 days'
      when 'pro_monthly_pass' then interval '31 days'
      when 'pro_yearly_pass' then interval '366 days'
    end,
    catalog_version = greatest(product.catalog_version, 1),
    updated_at = now()
where product.product_key in (
  'pro_weekly_pass', 'pro_monthly_pass', 'pro_yearly_pass'
)
  and product.enabled = false
  and not exists (
    select 1
    from public.billing_product_provider_mappings mapping
    where mapping.product_key = product.product_key
  );

commit;
