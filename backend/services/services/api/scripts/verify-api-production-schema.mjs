#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;

const REQUIRED = Object.freeze({
  tables: {
    api_consumers: {
      columns: ["id", "owner_user_id", "key_prefix", "api_key_hash", "status"],
    },
    api_usage_events: {
      columns: [
        "consumer_id",
        "request_id",
        "method",
        "endpoint",
        "created_at",
      ],
    },
    api_usage_buckets: {
      columns: [
        "consumer_id",
        "period_start",
        "request_count",
        "monthly_quota",
      ],
    },
    api_partner_events: {
      columns: ["consumer_id", "request_id", "event_type", "created_at"],
    },
    profiles: { columns: ["user_id", "credits"] },
    credit_transactions: {
      columns: ["user_id", "amount", "type", "related_id", "related_type"],
    },
    billing_products: {
      columns: [
        "product_key",
        "fulfillment_kind",
        "renewal_mode",
        "expected_amount_minor",
        "currency",
        "entitlement_duration",
        "credit_quantity",
        "enabled",
      ],
    },
    billing_product_provider_mappings: {
      columns: [
        "product_key",
        "provider",
        "environment",
        "provider_product_id",
      ],
    },
    billing_checkout_intents: {
      columns: [
        "id",
        "user_id",
        "provider",
        "environment",
        "product_key",
        "idempotency_key",
        "return_surface",
        "status",
      ],
    },
    billing_provider_events: {
      columns: [
        "provider",
        "environment",
        "event_id",
        "payload_hash",
        "status",
        "next_retry_at",
      ],
    },
  },
  indexes: [
    "idx_api_consumers_owner",
    "idx_api_consumers_key_hash_unique",
    "idx_api_consumers_key_prefix_unique",
    "idx_api_usage_consumer_created",
    "credit_transactions_api_ref_unique",
    "billing_checkout_intents_provider_environment_status_expires_idx",
    "billing_events_provider_environment_retry_idx",
  ],
  constraints: [
    "api_usage_buckets_consumer_period_unique",
    "billing_products_api_credit_contract_check",
    "billing_checkout_intents_provider_environment_user_idempotency_key",
    "billing_checkout_intents_product_provider_environment_fkey",
    "billing_provider_events_provider_event_unique",
  ],
  productMapping: {
    provider: "bachs",
    environment: "BILLING_ENVIRONMENT (default: live)",
    fulfillmentKind: "credit_pack",
    renewalMode: "one_time",
    minimumCreditQuantity: 1,
    validityDays: null,
  },
});

function selectedEnvironment() {
  const argument = process.argv.find((value) =>
    value.startsWith("--environment="),
  );
  const environment =
    argument?.slice("--environment=".length) ||
    process.env.BILLING_ENVIRONMENT ||
    "live";
  if (environment !== "sandbox" && environment !== "live") {
    throw new Error("BILLING_ENVIRONMENT must be sandbox or live");
  }
  return environment;
}

function columnKey(table, column) {
  return `${table}.${column}`;
}

async function verify(client, environment) {
  const tableNames = Object.keys(REQUIRED.tables);
  const [columnsResult, indexesResult, constraintsResult] = await Promise.all([
    client.query(
      `select table_name, column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])`,
      [tableNames],
    ),
    client.query(
      `select indexname, indexdef
       from pg_catalog.pg_indexes
       where schemaname = 'public' and indexname = any($1::text[])`,
      [REQUIRED.indexes],
    ),
    client.query(
      `select con.conname, pg_catalog.pg_get_constraintdef(con.oid, true) as definition
       from pg_catalog.pg_constraint con
       join pg_catalog.pg_class rel on rel.oid = con.conrelid
       join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
       where ns.nspname = 'public' and con.conname = any($1::text[])`,
      [REQUIRED.constraints],
    ),
  ]);

  const columns = new Map(
    columnsResult.rows.map((row) => [
      columnKey(row.table_name, row.column_name),
      row,
    ]),
  );
  const indexNames = new Set(indexesResult.rows.map((row) => row.indexname));
  const constraintNames = new Set(
    constraintsResult.rows.map((row) => row.conname),
  );
  const missing = [];

  for (const [table, requirement] of Object.entries(REQUIRED.tables)) {
    for (const column of requirement.columns) {
      if (!columns.has(columnKey(table, column))) {
        missing.push(`column public.${table}.${column}`);
      }
    }
  }
  for (const index of REQUIRED.indexes) {
    if (!indexNames.has(index)) missing.push(`index public.${index}`);
  }
  for (const constraint of REQUIRED.constraints) {
    if (!constraintNames.has(constraint)) {
      missing.push(`constraint public.${constraint}`);
    }
  }

  const credits = columns.get("profiles.credits");
  if (
    credits &&
    (credits.data_type !== "integer" ||
      credits.is_nullable !== "NO" ||
      !/\b0\b/.test(String(credits.column_default ?? "")))
  ) {
    missing.push("contract public.profiles.credits integer not null default 0");
  }

  const hasProductTables = [
    ...REQUIRED.tables.billing_products.columns.map((column) =>
      columnKey("billing_products", column),
    ),
    ...REQUIRED.tables.billing_product_provider_mappings.columns.map((column) =>
      columnKey("billing_product_provider_mappings", column),
    ),
  ].every((key) => columns.has(key));
  const mapping = hasProductTables
    ? await client.query(
        `select exists (
       select 1
       from public.billing_products product
       inner join public.billing_product_provider_mappings mapping
         on mapping.product_key = product.product_key
       where product.enabled = true
         and product.fulfillment_kind = 'credit_pack'
         and product.renewal_mode = 'one_time'
         and product.credit_quantity > 0
         and product.entitlement_duration is null
         and product.expected_amount_minor > 0
         and product.currency ~ '^[A-Z]{3}$'
         and mapping.provider = 'bachs'
         and mapping.environment = $1
         and length(trim(mapping.provider_product_id)) > 0
     ) as present`,
        [environment],
      )
    : null;
  if (!mapping?.rows[0]?.present) {
    missing.push(`product mapping enabled bachs ${environment} credit_pack`);
  }

  return missing;
}

async function main() {
  if (process.argv.includes("--print-required")) {
    process.stdout.write(`${JSON.stringify(REQUIRED, null, 2)}\n`);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const environment = selectedEnvironment();
  const client = new Client({
    connectionString,
    application_name: "edutu-api-production-schema-verifier",
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });

  let transactionOpen = false;
  try {
    await client.connect();
    await client.query("begin transaction read only");
    transactionOpen = true;
    const missing = await verify(client, environment);
    await client.query("rollback");
    transactionOpen = false;

    if (missing.length > 0) {
      process.stderr.write(
        `API production schema verification failed (${missing.length} missing):\n${missing
          .map((item) => `- ${item}`)
          .join("\n")}\n`,
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write(
      `API production schema verified for billing environment ${environment}.\n`,
    );
  } finally {
    if (transactionOpen) {
      await client.query("rollback").catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

main().catch(() => {
  // Deliberately omit the database error: driver messages can contain hosts,
  // user names, or connection parameters. Operators can inspect secure logs.
  process.stderr.write(
    "API production schema verification failed; check database connectivity and secure server logs.\n",
  );
  process.exitCode = 1;
});
