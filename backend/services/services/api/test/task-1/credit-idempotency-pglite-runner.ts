import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { recordCreditPurchaseInTransaction } from "../../src/billing/billing-credit-ledger.sql";

async function execute(database: PGlite, statement: SQL) {
  const query = new PgDialect().sqlToQuery(statement);
  return database.query(query.sql, query.params);
}

async function main() {
  const database = new PGlite();
  try {
    await database.exec(`
      create table profiles (
        user_id text primary key,
        credits integer not null default 0,
        updated_at timestamptz not null default now()
      );
      create table credit_transactions (
        id bigint generated always as identity primary key,
        user_id text not null,
        amount integer not null,
        type text not null,
        description text,
        related_id text,
        related_type text
      );
      insert into profiles (user_id, credits) values ('user-1', 0);
    `);

    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260812090000_api_production_contract.sql",
    );
    const migration = readFileSync(migrationPath, "utf8");
    const purchaseIndex = migration.match(
      /create unique index if not exists billing_credit_transactions_purchase_unique[\s\S]*?;/i,
    )?.[0];
    if (!purchaseIndex) throw new Error("Task 1 purchase index is missing");
    await database.exec(purchaseIndex);

    const input = {
      userId: "user-1",
      credits: 100,
      description: "Credit pack purchase: +100",
      reference: "paystack-credit-pack-1",
      relatedType: "credit_pack" as const,
    };
    const transaction = {
      execute: (statement: SQL) => execute(database, statement),
    };
    const firstDelivery = await recordCreditPurchaseInTransaction(
      transaction,
      input,
    );
    const duplicateDelivery = await recordCreditPurchaseInTransaction(
      transaction,
      input,
    );

    const profile = await database.query<{ credits: number }>(
      "select credits from profiles where user_id = 'user-1'",
    );
    const ledger = await database.query<{
      related_type: string;
      entries: number;
    }>(`
      select related_type, count(*)::integer as entries
      from credit_transactions
      group by related_type
    `);
    if (profile.rows[0]?.credits !== 100) {
      throw new Error(
        `Expected 100 credits, received ${profile.rows[0]?.credits}`,
      );
    }
    if (!firstDelivery || duplicateDelivery) {
      throw new Error(
        `Unexpected delivery results: ${JSON.stringify({ firstDelivery, duplicateDelivery })}`,
      );
    }
    if (
      ledger.rows.length !== 1 ||
      ledger.rows[0]?.related_type !== "credit_pack" ||
      ledger.rows[0]?.entries !== 1
    ) {
      throw new Error(
        `Unexpected ledger result: ${JSON.stringify(ledger.rows)}`,
      );
    }
    process.stdout.write(
      "credit_pack first delivery credited once; duplicate ignored\n",
    );
  } finally {
    await database.close();
  }

  const atomicDatabase = new PGlite();
  try {
    await atomicDatabase.exec(`
      create role anon;
      create role authenticated;
      create role service_role;

      create table public.billing_products (
        product_key text primary key,
        enabled boolean not null,
        fulfillment_kind text not null,
        credit_quantity integer not null,
        renewal_mode text not null,
        expected_amount_minor bigint not null,
        currency char(3) not null,
        feature_key text,
        entitlement_duration interval
      );
      create table public.billing_payment_ledger (
        id uuid primary key default gen_random_uuid(),
        provider text not null,
        environment text not null,
        provider_resource_id text not null,
        checkout_intent_id uuid,
        user_id text not null,
        entry_kind text not null,
        amount_minor bigint not null,
        currency char(3) not null,
        customer_amount_minor bigint not null,
        customer_currency char(3) not null,
        status text not null,
        occurred_at timestamptz not null,
        metadata jsonb not null,
        unique (provider, environment, provider_resource_id)
      );
      create table public.billing_entitlement_grants (
        id uuid primary key default gen_random_uuid(),
        provider text not null,
        environment text not null,
        source_kind text not null,
        source_resource_id text not null,
        user_id text not null,
        feature_key text not null,
        valid_from timestamptz not null,
        valid_until timestamptz,
        status text not null,
        unique (
          provider,
          environment,
          source_kind,
          source_resource_id,
          feature_key
        )
      );
      create table public.profiles (
        user_id text primary key,
        credits integer not null default 0,
        credits_balance integer not null default 0
      );
    `);

    const atomicMigration = readFileSync(
      resolve(
        __dirname,
        "../../../../../../supabase/migrations/20260811122000_atomic_billing_fulfillment.sql",
      ),
      "utf8",
    );
    await atomicDatabase.exec(atomicMigration);
    await atomicDatabase.exec(`
      insert into public.billing_products (
        product_key,
        enabled,
        fulfillment_kind,
        credit_quantity,
        renewal_mode,
        expected_amount_minor,
        currency
      ) values ('credits_100', true, 'credit_pack', 100, 'one_time', 499, 'USD');
      insert into public.profiles (user_id) values ('user-1');
    `);

    const delivery = `
      select public.billing_fulfill_credit_pack(
        'bachs', 'sandbox', 'payment-1', 'user-1', 'credits_100',
        499, 'USD', now(), null
      ) as result
    `;
    const firstDelivery = await atomicDatabase.query<{
      result: { fulfilled: boolean };
    }>(delivery);
    const duplicateDelivery = await atomicDatabase.query<{
      result: { fulfilled: boolean; duplicate: boolean };
    }>(delivery);
    const atomicState = await atomicDatabase.query<{
      credits: number;
      creditsBalance: number;
      ledgerEntries: number;
    }>(`
      select
        profiles.credits,
        profiles.credits_balance as "creditsBalance",
        (select count(*)::integer from public.credit_transactions) as "ledgerEntries"
      from public.profiles
      where user_id = 'user-1'
    `);

    if (
      firstDelivery.rows[0]?.result.fulfilled !== true ||
      duplicateDelivery.rows[0]?.result.fulfilled !== false ||
      duplicateDelivery.rows[0]?.result.duplicate !== true ||
      atomicState.rows[0]?.creditsBalance !== 100 ||
      atomicState.rows[0]?.ledgerEntries !== 1
    ) {
      throw new Error(
        `Unexpected atomic fulfillment result: ${JSON.stringify({
          firstDelivery: firstDelivery.rows,
          duplicateDelivery: duplicateDelivery.rows,
          atomicState: atomicState.rows,
        })}`,
      );
    }
    process.stdout.write(
      "atomic credit_pack first delivery fulfilled once; duplicate ignored\n",
    );
  } finally {
    await atomicDatabase.close();
  }
}

void main();
