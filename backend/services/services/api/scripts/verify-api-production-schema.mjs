#!/usr/bin/env node
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const DATA_PRIVILEGES = Object.freeze([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]);

const table = (columns, serviceRolePrivileges) => ({
  columns,
  rls: serviceRolePrivileges === null ? null : true,
  serviceRolePrivileges,
});
const view = (serviceRolePrivileges) => ({ serviceRolePrivileges });
const index = (name, tableName, keys, options = {}) => ({
  name,
  table: tableName,
  unique: options.unique ?? false,
  valid: true,
  ready: true,
  keys,
  predicate: options.predicate ?? null,
});

const REQUIRED = Object.freeze({
  tables: {
    api_consumers: table(
      ["id", "owner_user_id", "key_prefix", "api_key_hash", "status"],
      ["SELECT", "INSERT", "UPDATE"],
    ),
    api_usage_events: table(
      ["consumer_id", "request_id", "method", "endpoint", "created_at"],
      ["SELECT", "INSERT"],
    ),
    api_usage_buckets: table(
      ["consumer_id", "period_start", "request_count", "monthly_quota"],
      ["SELECT", "INSERT", "UPDATE"],
    ),
    api_partner_events: table(
      ["consumer_id", "request_id", "event_type", "created_at"],
      ["SELECT", "INSERT"],
    ),
    profiles: table(["user_id", "credits"], null),
    api_credit_balance_reconciliation_state: table(
      [
        "migration_key",
        "credits_column_preexisting",
        "legacy_column_preexisting",
        "initial_reconciliation_completed",
      ],
      [],
    ),
    api_credit_balance_reconciliation_audit: table(
      [
        "user_id",
        "observed_credits",
        "observed_credits_balance",
        "credit_transactions_net",
        "payment_ledger_credit_grants",
        "legacy_billing_credit_grants",
      ],
      ["SELECT"],
    ),
    api_credit_balance_reconciliation_resolutions: table(
      [
        "user_id",
        "expected_credits",
        "expected_credits_balance",
        "resolved_balance",
        "approved_by",
      ],
      [],
    ),
    credit_transactions: table(
      ["user_id", "amount", "type", "related_id", "related_type"],
      ["SELECT", "INSERT"],
    ),
    billing_providers: table(["provider", "display_name"], ["SELECT"]),
    billing_environments: table(["environment"], ["SELECT"]),
    billing_products: table(
      [
        "product_key",
        "fulfillment_kind",
        "renewal_mode",
        "expected_amount_minor",
        "currency",
        "entitlement_duration",
        "credit_quantity",
        "enabled",
      ],
      ["SELECT"],
    ),
    billing_product_contract_quarantine: table(
      ["product_key", "product_snapshot", "reason", "quarantined_at"],
      ["SELECT"],
    ),
    billing_product_provider_mappings: table(
      ["product_key", "provider", "environment", "provider_product_id"],
      ["SELECT"],
    ),
    billing_checkout_intents: table(
      [
        "id",
        "user_id",
        "provider",
        "environment",
        "product_key",
        "idempotency_key",
        "return_surface",
        "status",
      ],
      ["SELECT", "INSERT", "UPDATE"],
    ),
    billing_provider_events: table(
      [
        "provider",
        "environment",
        "event_id",
        "payload_hash",
        "status",
        "next_retry_at",
      ],
      ["SELECT", "INSERT", "UPDATE"],
    ),
  },
  views: {
    api_credit_balance_integrity_audit: view(["SELECT"]),
  },
  indexes: [
    index("idx_api_consumers_owner", "api_consumers", ["owner_user_id"]),
    index("idx_api_consumers_status", "api_consumers", ["status"]),
    index(
      "idx_api_consumers_key_hash_unique",
      "api_consumers",
      ["api_key_hash"],
      { unique: true },
    ),
    index(
      "idx_api_consumers_key_prefix_unique",
      "api_consumers",
      ["key_prefix"],
      { unique: true, predicate: "key_prefix is not null" },
    ),
    index("idx_api_usage_consumer_created", "api_usage_events", [
      "consumer_id",
      "created_at desc",
    ]),
    index("idx_api_partner_events_consumer_created", "api_partner_events", [
      "consumer_id",
      "created_at desc",
    ]),
    index(
      "credit_transactions_api_ref_unique",
      "credit_transactions",
      ["related_type", "related_id"],
      {
        unique: true,
        predicate:
          "related_id is not null and related_type = any array['api_request', 'api_credit_purchase']",
      },
    ),
    index(
      "billing_credit_transactions_purchase_unique",
      "credit_transactions",
      ["related_type", "related_id"],
      {
        unique: true,
        predicate: "related_id is not null and related_type = 'credit_pack'",
      },
    ),
    index(
      "billing_checkout_intents_provider_environment_status_expires_idx",
      "billing_checkout_intents",
      ["provider", "environment", "status", "expires_at"],
    ),
    index(
      "billing_events_provider_environment_retry_idx",
      "billing_provider_events",
      ["provider", "environment", "status", "next_retry_at"],
      {
        predicate:
          "processed_at is null and status = any array['received', 'failed']",
      },
    ),
  ],
  constraints: [
    {
      name: "profiles_credits_nonnegative_check",
      table: "profiles",
      type: "c",
      validated: true,
      definition: "CHECK (credits >= 0)",
    },
    {
      name: "api_usage_buckets_consumer_period_unique",
      table: "api_usage_buckets",
      type: "u",
      validated: true,
      definition: "UNIQUE (consumer_id, period_start)",
    },
    {
      name: "billing_products_api_credit_contract_check",
      table: "billing_products",
      type: "c",
      validated: true,
      definition:
        "CHECK (NOT enabled OR fulfillment_kind <> 'credit_pack'::text OR NOT renewal_mode IS DISTINCT FROM 'one_time'::text AND COALESCE(credit_quantity, 0) > 0 AND entitlement_duration IS NULL AND feature_key IS NULL)",
    },
    {
      name: "billing_checkout_intents_provider_environment_user_idempotency_",
      table: "billing_checkout_intents",
      type: "u",
      validated: true,
      definition: "UNIQUE (provider, environment, user_id, idempotency_key)",
    },
    {
      name: "billing_checkout_intents_product_provider_environment_fkey",
      table: "billing_checkout_intents",
      type: "f",
      validated: true,
      definition:
        "FOREIGN KEY (product_key, provider, environment) REFERENCES billing_product_provider_mappings(product_key, provider, environment)",
    },
    {
      name: "billing_provider_events_provider_event_unique",
      table: "billing_provider_events",
      type: "u",
      validated: true,
      definition: "UNIQUE (provider, environment, event_id)",
    },
  ],
  triggers: [
    {
      name: "trg_00_sync_profile_credit_balance_compat",
      table: "profiles",
      function: "sync_profile_credit_balance_compat",
      definition:
        "BEFORE INSERT OR UPDATE OF credits, credits_balance ON public.profiles",
    },
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

function normalizedSql(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/::[a-z0-9_.\[\]]+/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedConstraintDefinition(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/::[a-z0-9_.\[\]]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .replace(/\s*(<>|>=|<=|=|>)\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function columnKey(tableName, column) {
  return `${tableName}.${column}`;
}

function evaluateSnapshot(snapshot, environment) {
  const violations = [];
  const columns = new Map(
    snapshot.columns.map((row) => [
      columnKey(row.table_name, row.column_name),
      row,
    ]),
  );
  const tables = new Map(snapshot.tables.map((row) => [row.table_name, row]));
  const indexes = new Map(snapshot.indexes.map((row) => [row.name, row]));
  const constraints = new Map(
    snapshot.constraints.map((row) => [row.name, row]),
  );
  const triggers = new Map(
    (snapshot.triggers ?? []).map((row) => [row.name, row]),
  );
  const views = new Map(
    (snapshot.views ?? []).map((row) => [row.view_name, row]),
  );

  for (const [tableName, requirement] of Object.entries(REQUIRED.tables)) {
    for (const column of requirement.columns) {
      if (!columns.has(columnKey(tableName, column))) {
        violations.push(`column public.${tableName}.${column}`);
      }
    }

    if (requirement.rls !== null) {
      if (tables.get(tableName)?.rls_enabled !== requirement.rls) {
        violations.push(`RLS public.${tableName} enabled`);
      }

      const grants = snapshot.privileges.filter(
        (row) => row.table_name === tableName,
      );
      for (const roleName of ["PUBLIC", "anon", "authenticated"]) {
        for (const grant of grants.filter(
          (row) => row.role_name === roleName,
        )) {
          violations.push(
            `ACL public.${tableName} ${roleName} has no ${grant.privilege_type}`,
          );
        }
      }

      const actualServiceRole = new Set(
        grants
          .filter((row) => row.role_name === "service_role")
          .map((row) => row.privilege_type),
      );
      for (const privilege of requirement.serviceRolePrivileges) {
        if (!actualServiceRole.has(privilege)) {
          violations.push(
            `ACL public.${tableName} service_role grants ${privilege}`,
          );
        }
      }
      for (const privilege of actualServiceRole) {
        if (!requirement.serviceRolePrivileges.includes(privilege)) {
          violations.push(
            `ACL public.${tableName} service_role has no extra ${privilege}`,
          );
        }
      }
    }
  }

  const credits = columns.get("profiles.credits");
  if (
    credits &&
    (credits.data_type !== "integer" ||
      credits.is_nullable !== "NO" ||
      !/\b0\b/.test(String(credits.column_default ?? "")))
  ) {
    violations.push(
      "contract public.profiles.credits integer not null default 0",
    );
  }

  if (columns.has("profiles.credits_balance")) {
    for (const requirement of REQUIRED.triggers) {
      const actual = triggers.get(requirement.name);
      if (!actual) {
        violations.push(`trigger public.${requirement.name}`);
        continue;
      }
      if (actual.table !== requirement.table) {
        violations.push(
          `trigger public.${requirement.name} table public.${requirement.table}`,
        );
      }
      if (actual.function !== requirement.function) {
        violations.push(
          `trigger public.${requirement.name} function public.${requirement.function}`,
        );
      }
      if (
        !normalizedSql(actual.definition).includes(
          normalizedSql(requirement.definition),
        )
      ) {
        violations.push(`trigger public.${requirement.name} definition`);
      }
    }
  }

  for (const requirement of REQUIRED.indexes) {
    const actual = indexes.get(requirement.name);
    if (!actual) {
      violations.push(`index public.${requirement.name}`);
      continue;
    }
    if (actual.table !== requirement.table) {
      violations.push(
        `index public.${requirement.name} table public.${requirement.table}`,
      );
    }
    if (actual.unique !== requirement.unique) {
      violations.push(
        `index public.${requirement.name} unique=${requirement.unique}`,
      );
    }
    if (actual.valid !== requirement.valid) {
      violations.push(`index public.${requirement.name} valid`);
    }
    if (actual.ready !== requirement.ready) {
      violations.push(`index public.${requirement.name} ready`);
    }
    if (
      JSON.stringify(actual.keys.map(normalizedSql)) !==
      JSON.stringify(requirement.keys.map(normalizedSql))
    ) {
      violations.push(
        `index public.${requirement.name} ordered keys (${requirement.keys.join(", ")})`,
      );
    }
    if (requirement.predicate === null && actual.predicate !== null) {
      violations.push(`index public.${requirement.name} has no predicate`);
    } else if (
      requirement.predicate !== null &&
      normalizedSql(actual.predicate) !== normalizedSql(requirement.predicate)
    ) {
      violations.push(`index public.${requirement.name} predicate`);
    }
  }

  for (const requirement of REQUIRED.constraints) {
    const actual = constraints.get(requirement.name);
    if (!actual) {
      violations.push(`constraint public.${requirement.name}`);
      continue;
    }
    if (actual.table !== requirement.table) {
      violations.push(
        `constraint public.${requirement.name} table public.${requirement.table}`,
      );
    }
    if (actual.type !== requirement.type) {
      violations.push(
        `constraint public.${requirement.name} type ${requirement.type}`,
      );
    }
    if (
      requirement.validated !== null &&
      actual.validated !== requirement.validated
    ) {
      violations.push(
        `constraint public.${requirement.name} validated=${requirement.validated}`,
      );
    }
    if (
      normalizedConstraintDefinition(actual.definition) !==
      normalizedConstraintDefinition(requirement.definition)
    ) {
      violations.push(`constraint public.${requirement.name} definition`);
    }
  }

  for (const [viewName, requirement] of Object.entries(REQUIRED.views)) {
    if (!views.has(viewName)) {
      violations.push(`view public.${viewName}`);
      continue;
    }

    const grants = snapshot.privileges.filter(
      (row) => row.table_name === viewName,
    );
    for (const roleName of ["PUBLIC", "anon", "authenticated"]) {
      for (const grant of grants.filter((row) => row.role_name === roleName)) {
        violations.push(
          `ACL public.${viewName} ${roleName} has no ${grant.privilege_type}`,
        );
      }
    }

    const actualServiceRole = new Set(
      grants
        .filter((row) => row.role_name === "service_role")
        .map((row) => row.privilege_type),
    );
    for (const privilege of requirement.serviceRolePrivileges) {
      if (!actualServiceRole.has(privilege)) {
        violations.push(
          `ACL public.${viewName} service_role grants ${privilege}`,
        );
      }
    }
    for (const privilege of actualServiceRole) {
      if (!requirement.serviceRolePrivileges.includes(privilege)) {
        violations.push(
          `ACL public.${viewName} service_role has no extra ${privilege}`,
        );
      }
    }
  }

  if (!snapshot.product_mapping_present) {
    violations.push(`product mapping enabled bachs ${environment} credit_pack`);
  }
  if (snapshot.invalid_enabled_credit_product_keys.length > 0) {
    violations.push(
      `invalid enabled credit products: ${snapshot.invalid_enabled_credit_product_keys.join(", ")}`,
    );
  }

  return violations;
}

async function loadDatabaseSnapshot(client, environment) {
  const tableNames = Object.keys(REQUIRED.tables);
  const viewNames = Object.keys(REQUIRED.views);
  const relationNames = [...tableNames, ...viewNames];
  const indexNames = REQUIRED.indexes.map(({ name }) => name);
  const constraintNames = REQUIRED.constraints.map(({ name }) => name);
  const triggerNames = REQUIRED.triggers.map(({ name }) => name);
  const [columns, tables, indexes, constraints, triggers, views, privileges] =
    await Promise.all([
      client.query(
        `select table_name, column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])`,
        [tableNames],
      ),
      client.query(
        `select rel.relname as table_name, rel.relrowsecurity as rls_enabled
       from pg_catalog.pg_class rel
       join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
       where ns.nspname = 'public' and rel.relkind in ('r', 'p')
         and rel.relname = any($1::text[])`,
        [tableNames],
      ),
      client.query(
        `select
         idx.relname as name,
         tbl.relname as "table",
         ind.indisunique as "unique",
         ind.indisvalid as valid,
         ind.indisready as ready,
         array(
           select pg_catalog.pg_get_indexdef(ind.indexrelid, key_number, true)
           from generate_series(1, ind.indnkeyatts) key_number
           order by key_number
         ) as keys,
         pg_catalog.pg_get_expr(ind.indpred, ind.indrelid, true) as predicate
       from pg_catalog.pg_index ind
       join pg_catalog.pg_class idx on idx.oid = ind.indexrelid
       join pg_catalog.pg_class tbl on tbl.oid = ind.indrelid
       join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
       where ns.nspname = 'public' and idx.relname = any($1::text[])`,
        [indexNames],
      ),
      client.query(
        `select
         con.conname as name,
         rel.relname as "table",
         con.contype as type,
         con.convalidated as validated,
         pg_catalog.pg_get_constraintdef(con.oid, true) as definition
       from pg_catalog.pg_constraint con
       join pg_catalog.pg_class rel on rel.oid = con.conrelid
       join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
       where ns.nspname = 'public' and con.conname = any($1::text[])`,
        [constraintNames],
      ),
      client.query(
        `select
         trg.tgname as name,
         rel.relname as "table",
         proc.proname as function,
         pg_catalog.pg_get_triggerdef(trg.oid, true) as definition
       from pg_catalog.pg_trigger trg
       join pg_catalog.pg_class rel on rel.oid = trg.tgrelid
       join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
       join pg_catalog.pg_proc proc on proc.oid = trg.tgfoid
       where not trg.tgisinternal
         and ns.nspname = 'public'
         and trg.tgname = any($1::text[])`,
        [triggerNames],
      ),
      client.query(
        `select rel.relname as view_name
         from pg_catalog.pg_class rel
         join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
         where ns.nspname = 'public' and rel.relkind = 'v'
           and rel.relname = any($1::text[])`,
        [viewNames],
      ),
      client.query(
        `with target_relations as (
         select rel.oid, rel.relname as table_name, rel.relacl, rel.relowner
         from pg_catalog.pg_class rel
         join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
         where ns.nspname = 'public' and rel.relkind in ('r', 'p', 'v')
           and rel.relname = any($1::text[])
       ), roles(role_name) as (
         values ('anon'::text), ('authenticated'::text), ('service_role'::text)
       ), privileges(privilege_type) as (
         select unnest($2::text[])
       ), effective_grants as (
         select target.table_name, roles.role_name, privileges.privilege_type
         from target_relations target
         cross join roles
         cross join privileges
         where pg_catalog.has_table_privilege(
           roles.role_name,
           target.oid,
           privileges.privilege_type
         )
       ), public_grants as (
         select target.table_name, 'PUBLIC'::text as role_name, acl.privilege_type
         from target_relations target
         cross join lateral pg_catalog.aclexplode(
           coalesce(
             target.relacl,
             pg_catalog.acldefault('r', target.relowner)
           )
         ) acl
         where acl.grantee = 0
       )
       select table_name, role_name, privilege_type from effective_grants
       union
       select table_name, role_name, privilege_type from public_grants`,
        [relationNames, DATA_PRIVILEGES],
      ),
    ]);

  const hasProductTables = [
    ...REQUIRED.tables.billing_products.columns.map((column) =>
      columnKey("billing_products", column),
    ),
    ...REQUIRED.tables.billing_product_provider_mappings.columns.map((column) =>
      columnKey("billing_product_provider_mappings", column),
    ),
  ].every((key) =>
    columns.rows.some(
      (row) => columnKey(row.table_name, row.column_name) === key,
    ),
  );

  let productMappingPresent = false;
  let invalidEnabledCreditProductKeys = [];
  if (hasProductTables) {
    const [mapping, invalidProducts] = await Promise.all([
      client.query(
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
             and product.feature_key is null
             and product.expected_amount_minor > 0
             and product.currency ~ '^[A-Z]{3}$'
             and mapping.provider = 'bachs'
             and mapping.environment = $1
             and length(trim(mapping.provider_product_id)) > 0
         ) as present`,
        [environment],
      ),
      client.query(
        `select product_key
         from public.billing_products
         where enabled
           and fulfillment_kind = 'credit_pack'
           and (
             renewal_mode is distinct from 'one_time'
             or coalesce(credit_quantity, 0) <= 0
             or entitlement_duration is not null
             or feature_key is not null
           )
         order by product_key`,
      ),
    ]);
    productMappingPresent = mapping.rows[0]?.present === true;
    invalidEnabledCreditProductKeys = invalidProducts.rows.map(
      ({ product_key: productKey }) => productKey,
    );
  }

  return {
    columns: columns.rows,
    tables: tables.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
    triggers: triggers.rows,
    views: views.rows,
    privileges: privileges.rows,
    product_mapping_present: productMappingPresent,
    invalid_enabled_credit_product_keys: invalidEnabledCreditProductKeys,
  };
}

function printResult(violations, environment) {
  if (violations.length > 0) {
    process.stderr.write(
      `API production schema verification failed (${violations.length} violation(s)):\n${violations
        .map((item) => `- ${item}`)
        .join("\n")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `API production schema verified for billing environment ${environment}.\n`,
  );
}

async function main() {
  if (process.argv.includes("--print-required")) {
    process.stdout.write(`${JSON.stringify(REQUIRED, null, 2)}\n`);
    return;
  }

  const environment = selectedEnvironment();
  const fixtureArgument = process.argv.find((value) =>
    value.startsWith("--verify-fixture="),
  );
  if (fixtureArgument) {
    const fixturePath = fixtureArgument.slice("--verify-fixture=".length);
    const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
    printResult(evaluateSnapshot(snapshot, environment), environment);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

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
    const snapshot = await loadDatabaseSnapshot(client, environment);
    await client.query("rollback");
    transactionOpen = false;
    printResult(evaluateSnapshot(snapshot, environment), environment);
  } finally {
    if (transactionOpen) {
      await client.query("rollback").catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

main().catch(() => {
  // Deliberately omit database and fixture errors: driver messages and fixture
  // paths can contain hosts, user names, or other operator-only details.
  process.stderr.write(
    "API production schema verification failed; check database connectivity and secure server logs.\n",
  );
  process.exitCode = 1;
});
