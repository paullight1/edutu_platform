import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(__dirname, "../../../../../../");
const migrationNames = [
  "20260811120000_bachs_unified_billing_core.sql",
  "20260811121000_billing_identity_aliases.sql",
  "20260811122000_atomic_billing_fulfillment.sql",
  "20260811123000_derived_entitlements.sql",
  "20260812120000_bachs_checkout_contract_hardening.sql",
] as const;

function migrationPath(name: (typeof migrationNames)[number]): string {
  return resolve(repositoryRoot, "supabase/migrations", name);
}

function migration(name: (typeof migrationNames)[number]): string {
  const path = migrationPath(name);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("canonical billing schema migrations", () => {
  it("ships every additive root migration in deployment order", () => {
    expect(
      migrationNames.map((name) => existsSync(migrationPath(name))),
    ).toEqual([true, true, true, true, true]);
  });

  it("creates provider-neutral canonical tables with raw subjects and explicit money units", () => {
    const sql = migration("20260811120000_bachs_unified_billing_core.sql");

    for (const table of [
      "billing_providers",
      "billing_environments",
      "billing_products",
      "billing_product_provider_mappings",
      "billing_checkout_intents",
      "billing_provider_customers",
      "billing_provider_events",
      "billing_payment_ledger",
      "billing_provider_subscriptions",
      "billing_entitlement_grants",
      "billing_review_cases",
      "billing_admin_audit",
    ]) {
      expect(sql).toMatch(
        new RegExp(`create table if not exists public\\.${table}`, "i"),
      );
    }

    expect(sql).toMatch(
      /billing_checkout_intents[\s\S]*?user_id\s+text\s+not null/i,
    );
    expect(sql).toMatch(
      /billing_checkout_intents[\s\S]*?idempotency_key\s+text\s+not null/i,
    );
    expect(sql).toMatch(
      /billing_payment_ledger[\s\S]*?amount_minor\s+bigint\s+not null/i,
    );
    expect(sql).toMatch(
      /billing_payment_ledger[\s\S]*?customer_amount_minor\s+bigint/i,
    );
    expect(sql).toMatch(
      /billing_payment_ledger[\s\S]*?settlement_amount_minor\s+bigint/i,
    );
    expect(sql).toMatch(/customer_currency\s+char\(3\)/i);
    expect(sql).toMatch(/settlement_currency\s+char\(3\)/i);
    expect(sql).toMatch(
      /billing_products[\s\S]*?expected_amount_minor\s+bigint/i,
    );
    expect(sql).toMatch(
      /currency\s+char\(3\)[\s\S]*?check\s*\(\s*currency\s*=\s*upper\(currency\)/i,
    );
    expect(sql).toMatch(
      /foreign key \(provider\) references public\.billing_providers \(provider\)/i,
    );
    expect(sql).toMatch(/unique\s*\(provider,\s*environment,\s*event_id\)/i);
    expect(sql).not.toMatch(
      /provider\s+text[^\n]*check\s*\([^\n]*(?:bachs|revenuecat|paystack)/i,
    );
  });

  it("defines the canonical catalog keys as disabled unmapped placeholders", () => {
    const sql = migration("20260811120000_bachs_unified_billing_core.sql");

    for (const productKey of [
      "pro_weekly_pass",
      "pro_monthly_pass",
      "pro_yearly_pass",
      "pro_weekly_recurring",
      "pro_monthly_recurring",
      "pro_yearly_recurring",
      "season_pass",
      "credits_100",
      "credits_250",
      "credits_700",
    ]) {
      expect(sql).toMatch(new RegExp(`'${productKey}'`, "i"));
    }

    expect(sql).toMatch(
      /insert into public\.billing_products[\s\S]*?on conflict \(product_key\) do nothing/i,
    );
    expect(sql).toMatch(/values[\s\S]*?'pro_weekly_recurring'[\s\S]*?false/i);
    expect(sql).not.toMatch(
      /insert into public\.billing_product_provider_mappings[\s\S]*?values/i,
    );
  });

  it("keeps canonical records service-only and exposes only a current-user summary", () => {
    const sql = migration("20260811120000_bachs_unified_billing_core.sql");

    for (const table of [
      "billing_products",
      "billing_checkout_intents",
      "billing_provider_customers",
      "billing_provider_events",
      "billing_payment_ledger",
      "billing_provider_subscriptions",
      "billing_entitlement_grants",
      "billing_review_cases",
      "billing_admin_audit",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on table public\\.${table} from anon, authenticated`,
          "i",
        ),
      );
    }

    expect(sql).toMatch(
      /create or replace function public\.billing_reject_mutation\(\)/i,
    );
    expect(sql).toMatch(
      /before update or delete on public\.billing_payment_ledger/i,
    );
    expect(sql).toMatch(
      /before update or delete on public\.billing_admin_audit/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.billing_current_account_summary\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i,
    );
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'sub'/i);
    expect(sql).toMatch(
      /create or replace view public\.billing_account_summary[\s\S]*?security_invoker\s*=\s*true/i,
    );
    expect(sql).toMatch(
      /grant select on public\.billing_account_summary to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)[^;]*on table public\.billing_(?:products|checkout_intents|provider_customers|provider_events|payment_ledger|provider_subscriptions|entitlement_grants|review_cases|admin_audit)[^;]*to authenticated/i,
    );
  });

  it("preserves raw auth subjects while recording proven aliases without email inference", () => {
    const sql = migration("20260811121000_billing_identity_aliases.sql");

    expect(sql).toMatch(
      /create table if not exists public\.billing_identity_aliases/i,
    );
    expect(sql).toMatch(/canonical_user_id\s+text\s+not null/i);
    expect(sql).toMatch(/legacy_user_id\s+uuid/i);
    expect(sql).toMatch(/provider\s+text/i);
    expect(sql).toMatch(/environment\s+text/i);
    expect(sql).toMatch(/provider_customer_id\s+text/i);
    expect(sql).toMatch(/unique\s*\(canonical_user_id,\s*legacy_user_id\)/i);
    expect(sql).toMatch(
      /unique\s*\(provider,\s*environment,\s*provider_customer_id\)/i,
    );
    expect(sql).not.toMatch(/\bemail\b\s*(?:=|in\s*\(|like|ilike)/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(
      /revoke all on table public\.billing_identity_aliases from anon, authenticated/i,
    );
  });

  it("provides service-only atomic one-time and credit fulfillment", () => {
    const sql = migration("20260811122000_atomic_billing_fulfillment.sql");

    expect(sql).toMatch(
      /create or replace function public\.billing_fulfill_one_time_purchase/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.billing_fulfill_credit_pack/i,
    );
    expect(sql).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    expect(sql).toMatch(/insert into public\.billing_payment_ledger/i);
    expect(sql).toMatch(
      /on conflict \(provider, environment, provider_resource_id\) do nothing/i,
    );
    expect(sql).toMatch(/insert into public\.billing_entitlement_grants/i);
    expect(sql).toMatch(/insert into public\.credit_transactions/i);
    expect(sql).toMatch(
      /alter table public\.credit_transactions alter column user_id type text using user_id::text/i,
    );
    expect(sql).toMatch(
      /update public\.profiles[\s\S]*?credits(?:_balance)?\s*=/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.billing_fulfill_credit_pack[\s\S]*?from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.billing_fulfill_credit_pack[\s\S]*?to service_role/i,
    );
  });

  it("keeps the compatibility table derived from all currently active grants", () => {
    const sql = migration("20260811123000_derived_entitlements.sql");

    expect(sql).toMatch(
      /create table if not exists public\.billing_entitlements/i,
    );
    expect(sql).not.toMatch(
      /create or replace view public\.billing_entitlements/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.billing_has_active_pro_grant/i,
    );
    expect(sql).toMatch(/exists\s*\([\s\S]*?billing_entitlement_grants/i);
    expect(sql).toMatch(/feature_key\s*=\s*'pro'/i);
    expect(sql).toMatch(/status\s*=\s*'active'/i);
    expect(sql).toMatch(/revoked_at is null/i);
    expect(sql).toMatch(
      /(?:g\.|active_grant\.)?valid_until is null\s+or (?:g\.|active_grant\.)?valid_until > p_as_of/i,
    );
    expect(sql).toMatch(/bool_or\(g\.valid_until is null\)/i);
    expect(sql).toMatch(
      /case\s+when v_has_unbounded then null\s+else max\(g\.valid_until\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.billing_refresh_entitlement_projection/i,
    );
    expect(sql).toMatch(/on conflict \(user_id, feature_key\) do update/i);
    expect(sql).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    expect(sql).not.toMatch(
      /delete from public\.billing_entitlements[\s\S]*?where user_id = p_user_id/i,
    );
  });

  it("hardens checkout, catalog, and event contracts without enabling Bachs collection", () => {
    const sql = migration(
      "20260812120000_bachs_checkout_contract_hardening.sql",
    );

    expect(sql).toMatch(
      /alter table public\.billing_checkout_intents[\s\S]*?add column if not exists return_surface text/i,
    );
    expect(sql).toMatch(/provider_checkout_url_hash text/i);
    expect(sql).toMatch(/failure_code text/i);
    expect(sql).toMatch(
      /unique\s*\(provider,\s*environment,\s*user_id,\s*idempotency_key\)/i,
    );
    expect(sql).toMatch(
      /foreign key \(product_key,\s*provider,\s*environment\)[\s\S]*?references public\.billing_product_provider_mappings \(product_key,\s*provider,\s*environment\)/i,
    );
    expect(sql).toMatch(/check \(return_surface in \('web', 'pwa'\)\)/i);
    expect(sql).toMatch(
      /billing_checkout_intents_provider_environment_status_expires_idx/i,
    );

    expect(sql).toMatch(/billing_products_fulfillment_contract_check/i);
    expect(sql).toMatch(/billing_products_enabled_price_check/i);
    expect(sql).toMatch(/billing_products_payment_policy_check/i);
    expect(sql).toMatch(/billing_provider_events_status_check/i);
    expect(sql).toMatch(/billing_events_provider_environment_retry_idx/i);
    expect(sql).toMatch(/on conflict \(product_key\) do update/i);
    expect(sql).toMatch(/enabled = false/i);
    expect(sql).not.toMatch(
      /insert into public\.billing_product_provider_mappings[\s\S]*?values/i,
    );
  });
});
