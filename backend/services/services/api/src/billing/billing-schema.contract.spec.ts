import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getTableColumns } from "drizzle-orm";

const mockExecute = jest.fn();

jest.mock("../db", () => ({ db: { execute: mockExecute } }));

import { apiConsumers, profiles } from "../db/schema";
import { BillingRepository } from "./billing.repository";

const repositoryRoot = resolve(__dirname, "../../../../../../");
const apiRoot = resolve(__dirname, "../..");
const apiProductionMigrationPath = resolve(
  apiRoot,
  "supabase/migrations/20260812090000_api_production_contract.sql",
);
const schemaVerificationScriptPath = resolve(
  apiRoot,
  "scripts/verify-api-production-schema.mjs",
);
const apiMigrationDirectory = resolve(apiRoot, "supabase/migrations");

function apiCreditUpgradeMigrationPath(): string | null {
  const name = readdirSync(apiMigrationDirectory).find((entry) =>
    entry.endsWith("_api_credit_contract_upgrade_guard.sql"),
  );
  return name ? resolve(apiMigrationDirectory, name) : null;
}
const migrationNames = [
  "20260811120000_bachs_unified_billing_core.sql",
  "20260811121000_billing_identity_aliases.sql",
  "20260811122000_atomic_billing_fulfillment.sql",
  "20260811123000_derived_entitlements.sql",
  "20260812120000_bachs_checkout_contract_hardening.sql",
] as const;

type VerificationManifest = {
  tables: Record<
    string,
    {
      columns: string[];
      rls: boolean | null;
      serviceRolePrivileges: string[] | null;
    }
  >;
  indexes: Array<{
    name: string;
    table: string;
    unique: boolean;
    valid: boolean;
    ready: boolean;
    keys: string[];
    predicate: string | null;
  }>;
  constraints: Array<{
    name: string;
    table: string;
    type: string;
    validated: boolean | null;
    definition: string;
  }>;
  productMapping: Record<string, unknown>;
};

function verificationManifest(): VerificationManifest {
  const result = spawnSync(
    process.execPath,
    [schemaVerificationScriptPath, "--print-required"],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as VerificationManifest;
}

function validVerificationFixture(manifest: VerificationManifest) {
  return {
    columns: Object.entries(manifest.tables).flatMap(([table, requirement]) =>
      requirement.columns.map((column) => ({
        table_name: table,
        column_name: column,
        data_type:
          table === "profiles" && column === "credits" ? "integer" : "text",
        is_nullable:
          table === "profiles" && column === "credits" ? "NO" : "YES",
        column_default:
          table === "profiles" && column === "credits" ? "0" : null,
      })),
    ),
    tables: Object.entries(manifest.tables).map(([table, requirement]) => ({
      table_name: table,
      rls_enabled: requirement.rls,
    })),
    indexes: manifest.indexes.map((index) => ({ ...index })),
    constraints: manifest.constraints.map((constraint) => ({ ...constraint })),
    privileges: Object.entries(manifest.tables).flatMap(
      ([table, requirement]) =>
        (requirement.serviceRolePrivileges ?? []).map((privilege) => ({
          table_name: table,
          role_name: "service_role",
          privilege_type: privilege,
        })),
    ),
    product_mapping_present: true,
    invalid_enabled_credit_product_keys: [],
  };
}

function runVerificationFixture(fixture: unknown) {
  const directory = mkdtempSync(resolve(tmpdir(), "edutu-schema-contract-"));
  const fixturePath = resolve(directory, "catalog.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));
  try {
    return spawnSync(
      process.execPath,
      [
        schemaVerificationScriptPath,
        "--environment=sandbox",
        `--verify-fixture=${fixturePath}`,
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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

describe("production API credit contract", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("uses profiles.credits as the non-null zero-default canonical balance", () => {
    const profileColumns = getTableColumns(profiles);

    expect(profileColumns.creditsBalance.name).toBe("credits");
    expect(profileColumns.creditsBalance.notNull).toBe(true);
    expect(profileColumns.creditsBalance.hasDefault).toBe(true);
  });

  it("ships the additive API ownership, credit-ledger, and billing contract migration", () => {
    expect(existsSync(apiProductionMigrationPath)).toBe(true);
    const sql = existsSync(apiProductionMigrationPath)
      ? readFileSync(apiProductionMigrationPath, "utf8")
      : "";

    for (const column of [
      "owner_user_id",
      "key_prefix",
      "api_key_hash",
      "status",
    ]) {
      expect(sql).toMatch(new RegExp(`api_consumers[\\s\\S]*?${column}`, "i"));
    }

    expect(sql).toMatch(
      /profiles[\s\S]*?credits\s+integer[\s\S]*?default\s+0[\s\S]*?set\s+not\s+null/i,
    );
    expect(sql).toMatch(/sync_profile_credit_balance_compat/i);
    expect(sql).not.toMatch(/drop\s+column[\s\S]*?credits_balance/i);
    expect(sql).toMatch(/credit_transactions_api_ref_unique/i);
    expect(sql).toMatch(/api_usage_buckets_consumer_period_unique/i);
    expect(sql).toMatch(/billing_products_api_credit_contract_check/i);
    expect(sql).toMatch(
      /billing_checkout_intents_provider_environment_user_idempotency_key/i,
    );
    expect(sql).toMatch(
      /billing_checkout_intents_product_provider_environment_fkey/i,
    );
    expect(sql).toMatch(/billing_provider_events_provider_event_unique/i);
  });

  it("audits divergent balances and aborts before any compatibility synchronization", () => {
    const sql = readFileSync(apiProductionMigrationPath, "utf8");

    expect(sql).toMatch(
      /create table if not exists public\.api_credit_balance_reconciliation_audit/i,
    );
    expect(sql).toMatch(
      /create table if not exists public\.api_credit_balance_reconciliation_resolutions/i,
    );
    expect(sql).toMatch(/public\.credit_transactions/i);
    expect(sql).toMatch(/public\.billing_payment_ledger/i);
    expect(sql).toMatch(/public\.billing_transactions/i);
    expect(sql).toMatch(/unresolved[^']*credit balance[^']*mismatch/i);
    expect(sql).toMatch(/mismatch_count/i);
    expect(sql).toMatch(/initial_reconciliation_completed/i);
    expect(sql).toMatch(/had_credits or reconciliation_completed/i);

    const auditPosition = sql.search(
      /insert into public\.api_credit_balance_reconciliation_audit/i,
    );
    const durableCommitPosition = sql.indexOf("commit;", auditPosition);
    const abortPosition = sql.search(
      /raise exception[^;]*unresolved[^;]*credit balance[^;]*mismatch/i,
    );
    const synchronizationPosition = sql.search(
      /create or replace function public\.sync_profile_credit_balance_compat/i,
    );

    expect(auditPosition).toBeGreaterThan(-1);
    expect(durableCommitPosition).toBeGreaterThan(auditPosition);
    expect(abortPosition).toBeGreaterThan(durableCommitPosition);
    expect(synchronizationPosition).toBeGreaterThan(abortPosition);
    expect(sql).not.toMatch(
      /set\s+credits_balance\s*=\s*credits\s+where\s+credits_balance\s+is\s+distinct\s+from\s+credits/i,
    );
  });

  it("quarantines invalid enabled credit products and validates the contract", () => {
    const sql = readFileSync(apiProductionMigrationPath, "utf8");

    expect(sql).toMatch(
      /create table if not exists public\.billing_product_contract_quarantine/i,
    );
    expect(sql).toMatch(
      /insert into public\.billing_product_contract_quarantine[\s\S]*?from public\.billing_products/i,
    );
    expect(sql).toMatch(
      /update public\.billing_products[\s\S]*?set enabled = false[\s\S]*?fulfillment_kind = 'credit_pack'/i,
    );
    expect(sql).toMatch(
      /validate constraint billing_products_api_credit_contract_check/i,
    );
  });

  it("uses credit_pack as the only purchase-ledger discriminator", () => {
    const apiMigration = readFileSync(apiProductionMigrationPath, "utf8");
    const atomicMigration = migration(
      "20260811122000_atomic_billing_fulfillment.sql",
    );
    const billingService = readFileSync(
      resolve(apiRoot, "src/billing/billing.service.ts"),
      "utf8",
    );
    const billingLedgerSql = readFileSync(
      resolve(apiRoot, "src/billing/billing-credit-ledger.sql.ts"),
      "utf8",
    );

    expect(apiMigration).toMatch(
      /billing_credit_transactions_purchase_unique[\s\S]*?related_type = 'credit_pack'/i,
    );
    expect(atomicMigration).toMatch(
      /billing_credit_transactions_purchase_unique[\s\S]*?where related_id is not null and related_type = 'credit_pack'/i,
    );
    expect(atomicMigration).toMatch(
      /insert into public\.credit_transactions[\s\S]*?'credit_pack'/i,
    );
    expect(atomicMigration).toMatch(
      /insert into public\.credit_transactions[\s\S]*?on conflict \(related_type, related_id\)[\s\S]*?related_type = 'credit_pack'[\s\S]*?do nothing/i,
    );
    expect(billingLedgerSql).toMatch(
      /on conflict \(related_type, related_id\)[\s\S]*?related_type = 'credit_pack'/i,
    );
    expect(billingService).toMatch(/CREDIT_PACK_LEDGER_RELATED_TYPE/i);
    expect(billingService).toMatch(/recordCreditPurchaseInTransaction/i);
    expect(
      `${apiMigration}\n${atomicMigration}\n${billingService}\n${billingLedgerSql}`,
    ).not.toContain("billing_credit_pack");
  });

  it("ships a forward upgrade gate and locks profiles through reconciliation cutover", () => {
    const path = apiCreditUpgradeMigrationPath();
    expect(path).not.toBeNull();
    const sql = path ? readFileSync(path, "utf8") : "";

    expect(sql).toMatch(/supabase_migrations\.schema_migrations/i);
    expect(sql).toMatch(/20260812090000/);
    expect(sql).toMatch(/api_credit_cutover_upgrade_audit/i);
    expect(sql).toMatch(/api_credit_cutover_upgrade_attestations/i);
    expect(sql).toMatch(/api_credit_balance_reconciliation_state/i);
    expect(sql).toMatch(/raise exception[^;]*attestation/i);
    expect(sql).toMatch(
      /lock table public\.profiles in share row exclusive mode/i,
    );

    const lockPosition = sql.search(
      /lock table public\.profiles in share row exclusive mode/i,
    );
    const triggerPosition = sql.search(
      /create (?:or replace )?trigger trg_00_sync_profile_credit_balance_compat/i,
    );
    const finalInvariantPosition = sql.search(
      /raise exception[^;]*remaining[^;]*mismatch/i,
    );
    expect(lockPosition).toBeGreaterThan(-1);
    expect(triggerPosition).toBeGreaterThan(lockPosition);
    expect(finalInvariantPosition).toBeGreaterThan(triggerPosition);
  });

  it("audits and blocks an already-applied divergent upgrade before mutation", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        resolve(apiRoot, "test/task-1/upgrade-gate-pglite-runner.ts"),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      "upgrade gate audited the mismatch and preserved the divergent balances",
    );
  });

  it("returns only non-expiring one-time credit products with positive quantity", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          product_key: "credits_100",
          fulfillment_kind: "credit_pack",
          renewal_mode: "one_time",
          provider_product_id: "bachs_credits_100_sandbox",
          expected_amount_minor: "499",
          currency: "USD",
          cadence: "one_time",
          credit_quantity: "100",
          validity_days: null,
          allowed_payment_methods: ["card"],
          catalog_version: "1",
        },
      ],
    } as never);

    await expect(
      new BillingRepository().findEnabledProduct("credits_100", "sandbox"),
    ).resolves.toMatchObject({
      fulfillmentKind: "credits",
      renewalMode: "one_time",
      creditQuantity: 100,
      validityDays: null,
      expectedAmountMinor: 499,
      currency: "USD",
      providerProductId: "bachs_credits_100_sandbox",
    });
  });

  it("fails closed when an enabled credit product violates the credit contract", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          product_key: "credits_broken",
          fulfillment_kind: "credit_pack",
          renewal_mode: "recurring",
          provider_product_id: "bachs_credits_broken_sandbox",
          expected_amount_minor: "499",
          currency: "USD",
          cadence: "monthly",
          credit_quantity: "0",
          validity_days: "30",
          allowed_payment_methods: ["card"],
          catalog_version: "1",
        },
      ],
    } as never);

    await expect(
      new BillingRepository().findEnabledProduct("credits_broken", "sandbox"),
    ).rejects.toThrow("Invalid credit product contract");
  });

  it("prints every schema object required by production verification", () => {
    const required = verificationManifest();

    expect(required.tables.api_consumers.columns).toEqual(
      expect.arrayContaining([
        "owner_user_id",
        "key_prefix",
        "api_key_hash",
        "status",
      ]),
    );
    expect(required.tables.profiles.columns).toContain("credits");
    expect(required.tables.credit_transactions.columns).toEqual(
      expect.arrayContaining([
        "user_id",
        "amount",
        "related_id",
        "related_type",
      ]),
    );
    expect(required.tables.billing_products).toBeDefined();
    expect(required.tables.billing_product_provider_mappings).toBeDefined();
    expect(required.tables.billing_checkout_intents).toBeDefined();
    expect(required.tables.billing_provider_events).toBeDefined();
    expect(required.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "credit_transactions_api_ref_unique",
        "billing_credit_transactions_purchase_unique",
        "billing_events_provider_environment_retry_idx",
      ]),
    );
    expect(required.constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "billing_products_api_credit_contract_check",
        "billing_checkout_intents_provider_environment_user_idempotency_",
        "billing_checkout_intents_product_provider_environment_fkey",
        "billing_provider_events_provider_event_unique",
      ]),
    );
    expect(required.tables.api_consumers).toMatchObject({
      rls: true,
      serviceRolePrivileges: ["SELECT", "INSERT", "UPDATE"],
    });
    expect(
      required.constraints.find(
        ({ name }) => name === "billing_products_api_credit_contract_check",
      ),
    ).toMatchObject({ type: "c", validated: true });
    expect(required.productMapping).toMatchObject({
      fulfillmentKind: "credit_pack",
      renewalMode: "one_time",
      minimumCreditQuantity: 1,
      validityDays: null,
    });
  });

  it("reads effective PostgreSQL index, constraint, RLS, and ACL state", () => {
    const script = readFileSync(schemaVerificationScriptPath, "utf8");

    expect(script).toMatch(/pg_catalog\.pg_index/i);
    expect(script).toMatch(/indisunique/i);
    expect(script).toMatch(/indisvalid/i);
    expect(script).toMatch(/indisready/i);
    expect(script).toMatch(/pg_get_indexdef/i);
    expect(script).toMatch(/pg_get_expr\(ind\.indpred/i);
    expect(script).toMatch(/con\.contype/i);
    expect(script).toMatch(/con\.convalidated/i);
    expect(script).toMatch(/rel\.relrowsecurity/i);
    expect(script).toMatch(/has_table_privilege/i);
    expect(script).toMatch(/aclexplode/i);
    expect(script).toMatch(/invalid_enabled_credit_product_keys/i);
  });

  it("accepts a fixture only when catalog semantics, RLS, and ACLs match", () => {
    const manifest = verificationManifest();
    const result = runVerificationFixture(validVerificationFixture(manifest));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "API production schema verified for billing environment sandbox",
    );
  });

  it("rejects invalid index, constraint, product, RLS, and ACL semantics", () => {
    const manifest = verificationManifest();
    const fixture = validVerificationFixture(manifest);
    const purchaseIndex = fixture.indexes.find(
      ({ name }) => name === "billing_credit_transactions_purchase_unique",
    );
    const productConstraint = fixture.constraints.find(
      ({ name }) => name === "billing_products_api_credit_contract_check",
    );
    const consumers = fixture.tables.find(
      ({ table_name }) => table_name === "api_consumers",
    );

    if (!purchaseIndex || !productConstraint || !consumers) {
      throw new Error("Verification manifest is incomplete");
    }
    purchaseIndex.unique = false;
    purchaseIndex.valid = false;
    purchaseIndex.keys = [...purchaseIndex.keys].reverse();
    purchaseIndex.predicate = null;
    productConstraint.type = "u";
    productConstraint.validated = false;
    productConstraint.definition = "UNIQUE (product_key)";
    consumers.rls_enabled = false;
    fixture.privileges.push({
      table_name: "api_consumers",
      role_name: "authenticated",
      privilege_type: "SELECT",
    });
    fixture.privileges = fixture.privileges.filter(
      ({ table_name, role_name, privilege_type }) =>
        !(
          table_name === "api_consumers" &&
          role_name === "service_role" &&
          privilege_type === "UPDATE"
        ),
    );
    fixture.invalid_enabled_credit_product_keys = ["credits_legacy_bad"];

    const result = runVerificationFixture(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "index public.billing_credit_transactions_purchase_unique unique",
    );
    expect(result.stderr).toContain(
      "constraint public.billing_products_api_credit_contract_check type c",
    );
    expect(result.stderr).toContain("RLS public.api_consumers enabled");
    expect(result.stderr).toContain(
      "ACL public.api_consumers authenticated has no SELECT",
    );
    expect(result.stderr).toContain(
      "ACL public.api_consumers service_role grants UPDATE",
    );
    expect(result.stderr).toContain(
      "invalid enabled credit products: credits_legacy_bad",
    );
  });

  it.each([
    ["OR true", "OR TRUE"],
    ["zero-credit escape", "OR credit_quantity = 0"],
    ["recurring escape", "OR renewal_mode = 'recurring'"],
    ["expiring escape", "OR entitlement_duration IS NOT NULL"],
    ["feature escape", "OR feature_key IS NOT NULL"],
  ])(
    "rejects a validated credit-product constraint weakened by %s",
    (_, escape) => {
      const manifest = verificationManifest();
      const fixture = validVerificationFixture(manifest);
      const productConstraint = fixture.constraints.find(
        ({ name }) => name === "billing_products_api_credit_contract_check",
      );
      if (!productConstraint) {
        throw new Error("Credit product constraint manifest is missing");
      }
      productConstraint.definition = `CHECK (
      NOT enabled
      OR fulfillment_kind <> 'credit_pack'
      OR (
        renewal_mode IS NOT DISTINCT FROM 'one_time'
        AND COALESCE(credit_quantity, 0) > 0
        AND entitlement_duration IS NULL
        AND feature_key IS NULL
      )
      ${escape}
    )`;

      const result = runVerificationFixture(fixture);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "constraint public.billing_products_api_credit_contract_check definition",
      );
    },
  );

  it("keeps the API-consumer Drizzle contract aligned with ownership and key lookup", () => {
    const columns = getTableColumns(apiConsumers);

    expect(Object.values(columns).map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "owner_user_id",
        "key_prefix",
        "api_key_hash",
        "status",
      ]),
    );
  });
});
