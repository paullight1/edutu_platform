-- Server-owned API credit catalog. These products are distinct from the
-- broader-app credits_* catalog and remain disabled until deployment supplies
-- verified Bachs IDs, prices, currency, environment mappings, and enables them.

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
  ('api_credits_100', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 100, false, 1),
  ('api_credits_250', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 250, false, 1),
  ('api_credits_700', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 700, false, 1)
on conflict (product_key) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'api_credit_products_contract_check'
      and conrelid = 'public.billing_products'::regclass
  ) then
    alter table public.billing_products
      add constraint api_credit_products_contract_check
      check (
        product_key not in ('api_credits_100', 'api_credits_250', 'api_credits_700')
        or (
          fulfillment_kind = 'credit_pack'
          and feature_key is null
          and renewal_mode = 'one_time'
          and entitlement_duration is null
          and (
            (product_key = 'api_credits_100' and credit_quantity = 100)
            or (product_key = 'api_credits_250' and credit_quantity = 250)
            or (product_key = 'api_credits_700' and credit_quantity = 700)
          )
        )
      ) not valid;
  end if;
end;
$$;

alter table public.billing_products
  validate constraint api_credit_products_contract_check;

commit;
