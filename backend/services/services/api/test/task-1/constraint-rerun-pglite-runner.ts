import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const database = new PGlite();
  try {
    await database.exec(`
      create table public.billing_product_provider_mappings (
        product_key text not null,
        provider text not null,
        environment text not null,
        provider_product_id text not null,
        primary key (product_key, provider, environment)
      );
      create table public.billing_checkout_intents (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        provider text not null,
        environment text not null,
        product_key text not null,
        product_snapshot jsonb not null default '{}'::jsonb,
        expected_amount_minor bigint not null,
        currency char(3) not null,
        expires_at timestamptz not null,
        idempotency_key text not null,
        return_surface text
      );
      insert into public.billing_product_provider_mappings (
        product_key, provider, environment, provider_product_id
      ) values ('credits_100', 'bachs', 'live', 'bachs-credits-100');
      insert into public.billing_checkout_intents (
        user_id,
        provider,
        environment,
        product_key,
        product_snapshot,
        expected_amount_minor,
        currency,
        expires_at,
        idempotency_key,
        return_surface
      ) values (
        'constraint-user',
        'bachs',
        'live',
        'credits_100',
        '{}'::jsonb,
        499,
        'USD',
        now() + interval '1 hour',
        'constraint-rerun',
        'web'
      );
    `);

    const migration = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20260812090000_api_production_contract.sql",
      ),
      "utf8",
    );
    const constraintBlock = migration.match(
      /do \$\$\ndeclare\n  invalid_checkout_count bigint;[\s\S]*?\n\$\$;/i,
    )?.[0];
    if (!constraintBlock) {
      throw new Error("Task 1 checkout constraint block is missing");
    }

    await database.exec(constraintBlock);
    await database.exec(constraintBlock);

    const result = await database.query<{ count: number }>(`
      select count(*)::integer as count
      from pg_catalog.pg_constraint
      where conrelid = 'public.billing_checkout_intents'::regclass
        and conname = 'billing_checkout_intents_provider_environment_user_idempotency_'
    `);
    if (result.rows[0]?.count !== 1) {
      throw new Error(
        `Unexpected constraint count: ${JSON.stringify(result.rows)}`,
      );
    }

    process.stdout.write(
      "checkout idempotency constraint rerun remained idempotent\n",
    );
  } finally {
    await database.close();
  }
}

void main();
