#!/usr/bin/env node
/**
 * Read-only billing schema inventory. The connection string is obtained only
 * from BILLING_DATABASE_URL and is never printed or included in the report.
 */
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.BILLING_DATABASE_URL;
const tables = [
  "profiles",
  "payments",
  "payment_transactions",
  "billing_transactions",
  "billing_subscriptions",
  "subscriptions",
  "billing_entitlements",
  "processed_webhook_events",
  "credit_purchases",
  "credit_transactions",
  "billing_products",
  "billing_checkout_intents",
  "billing_provider_customers",
  "billing_provider_events",
  "billing_payment_ledger",
  "billing_provider_subscriptions",
  "billing_entitlement_grants",
  "billing_review_cases",
  "billing_admin_audit",
  "billing_identity_aliases",
];

const valueColumns = new Set(["provider", "type", "plan", "status"]);
const desiredValues = {
  provider: new Set(["bachs", "revenuecat", "paystack", "manual"]),
  status: new Set([
    "active",
    "canceled",
    "cancelled",
    "creating",
    "dead_letter",
    "expired",
    "failed",
    "needs_review",
    "open",
    "past_due",
    "pending",
    "processed",
    "processing",
    "received",
    "refunded",
    "resolved",
    "revoked",
    "succeeded",
    "underpaid",
  ]),
};

function quotedIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error("Unsafe catalog identifier");
  }
  return `"${value}"`;
}

function asCount(value) {
  return String(value ?? "0");
}

function classifyValue(column, value) {
  const normalized = value === null ? null : String(value).toLowerCase();
  const allowed = desiredValues[column];
  if (allowed) {
    return normalized !== null && allowed.has(normalized)
      ? "recognized"
      : "nonconforming";
  }

  // Product/transaction type and plan values are catalog-owned. They cannot
  // be guessed safely before the catalog mapping is approved.
  return "catalog_review_required";
}

async function main() {
  if (!connectionString) {
    throw new Error(
      "BILLING_DATABASE_URL is required for the read-only billing schema audit.",
    );
  }

  const client = new Client({
    connectionString,
    application_name: "edutu-billing-schema-audit",
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });
  await client.connect();

  let transactionOpen = false;
  try {
    await client.query("begin transaction read only");
    transactionOpen = true;

    const catalog = await client.query(
      `select
         c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         coalesce(s.n_live_tup, 0)::bigint as estimated_rows
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       left join pg_catalog.pg_stat_user_tables s on s.relid = c.oid
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and c.relname = any($1::text[])
       order by c.relname`,
      [tables],
    );

    const report = {
      generatedAt: new Date().toISOString(),
      mode: "transaction_read_only",
      note: "Metadata and aggregate counts only; no contact data, subjects, customer IDs, or provider payloads are emitted.",
      missingTables: tables.filter(
        (name) => !catalog.rows.some((row) => row.table_name === name),
      ),
      tables: {},
      identityShapeCounts: {},
      valueInventory: {},
      valuesRequiringReview: {},
    };

    const hasDeterministicIdentityFunction = Boolean(
      (
        await client.query(
          "select to_regprocedure('public.clerk_id_to_uuid(text)') is not null as present",
        )
      ).rows[0]?.present,
    );
    const hasProfilesTable = catalog.rows.some(
      (row) => row.table_name === "profiles",
    );

    for (const table of catalog.rows) {
      const name = table.table_name;
      const identifier = quotedIdentifier(name);
      const [columns, constraints, indexes, policies, triggers, count] =
        await Promise.all([
          client.query(
            `select
               a.attname as name,
               pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
               a.attnotnull as not_null
             from pg_catalog.pg_attribute a
             join pg_catalog.pg_class c on c.oid = a.attrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = $1
               and a.attnum > 0
               and not a.attisdropped
             order by a.attnum`,
            [name],
          ),
          client.query(
            `select
               con.conname as name,
               con.contype as type,
               pg_catalog.pg_get_constraintdef(con.oid, true) as definition
             from pg_catalog.pg_constraint con
             join pg_catalog.pg_class c on c.oid = con.conrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = $1
             order by con.conname`,
            [name],
          ),
          client.query(
            `select indexname as name, indexdef as definition
             from pg_catalog.pg_indexes
             where schemaname = 'public' and tablename = $1
             order by indexname`,
            [name],
          ),
          client.query(
            `select policyname as name, cmd, permissive, roles, qual, with_check
             from pg_catalog.pg_policies
             where schemaname = 'public' and tablename = $1
             order by policyname`,
            [name],
          ),
          client.query(
            `select
               t.tgname as name,
               pg_catalog.pg_get_triggerdef(t.oid, true) as definition
             from pg_catalog.pg_trigger t
             join pg_catalog.pg_class c on c.oid = t.tgrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = $1
               and not t.tgisinternal
             order by t.tgname`,
            [name],
          ),
          client.query(`select count(*)::bigint as count from public.${identifier}`),
        ]);

      report.tables[name] = {
        rlsEnabled: table.rls_enabled,
        estimatedRows: asCount(table.estimated_rows),
        exactRows: asCount(count.rows[0]?.count),
        columns: columns.rows,
        constraints: constraints.rows,
        indexes: indexes.rows,
        policies: policies.rows,
        triggers: triggers.rows,
      };

      const columnNames = new Set(columns.rows.map((column) => column.name));
      if (columnNames.has("user_id")) {
        const deterministicMatchExpression =
          hasDeterministicIdentityFunction && hasProfilesTable
            ? `count(*) filter (
                 where exists (
                   select 1
                   from public.profiles p
                   where p.user_id::text ~ '^user_'
                     and public.clerk_id_to_uuid(p.user_id::text)::text = source.user_id::text
                 )
               )::bigint`
            : "0::bigint";
        const identity = await client.query(
          `select
             count(*) filter (where source.user_id::text ~ '^user_')::bigint
               as raw_clerk_subject_rows,
             count(*) filter (
               where source.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             )::bigint as uuid_shaped_rows,
             ${deterministicMatchExpression} as deterministic_legacy_uuid_rows,
             count(*) filter (
               where source.user_id is not null
                 and source.user_id::text !~ '^user_'
                 and source.user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             )::bigint as other_subject_rows,
             count(*) filter (where source.user_id is not null)::bigint
               as total_subject_rows
           from public.${identifier} source`,
        );
        report.identityShapeCounts[name] = Object.fromEntries(
          Object.entries(identity.rows[0]).map(([key, value]) => [
            key,
            asCount(value),
          ]),
        );
      }

      const inventoryColumns = columns.rows
        .map((column) => column.name)
        .filter((column) => valueColumns.has(column));
      for (const column of inventoryColumns) {
        const quotedColumn = quotedIdentifier(column);
        const values = await client.query(
          `select ${quotedColumn} as value, count(*)::bigint as count
           from public.${identifier}
           group by ${quotedColumn}
           order by count desc, ${quotedColumn} nulls first`,
        );
        const inventoryKey = `${name}.${column}`;
        report.valueInventory[inventoryKey] = values.rows.map((row) => ({
          value: row.value,
          count: asCount(row.count),
          classification: classifyValue(column, row.value),
        }));
        report.valuesRequiringReview[inventoryKey] = report.valueInventory[
          inventoryKey
        ].filter((row) => row.classification !== "recognized");
      }
    }

    await client.query("rollback");
    transactionOpen = false;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (transactionOpen) {
      await client.query("rollback").catch(() => undefined);
    }
    await client.end();
  }
}

main().catch(() => {
  process.stderr.write(
    "Billing schema audit failed; inspect the secure execution environment for details.\n",
  );
  process.exitCode = 1;
});
