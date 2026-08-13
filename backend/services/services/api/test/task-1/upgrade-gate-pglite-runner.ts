import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const database = new PGlite();
  try {
    await database.exec(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (
        version text primary key
      );
      insert into supabase_migrations.schema_migrations (version)
      values ('20260812090000');

      create role anon;
      create role authenticated;
      create role service_role;

      create table public.profiles (
        user_id text primary key,
        credits integer,
        credits_balance integer
      );
      insert into public.profiles (user_id, credits, credits_balance)
      values ('upgrade-user', 40, 25);

      create table public.credit_transactions (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        amount integer not null,
        related_id text,
        related_type text
      );
      create table public.billing_payment_ledger (
        id uuid primary key default gen_random_uuid(),
        user_id text,
        metadata jsonb,
        status text
      );
      create table public.billing_transactions (
        id uuid primary key default gen_random_uuid(),
        user_id text,
        amount integer,
        status text,
        type text
      );
    `);

    const migration = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20260813074140_api_credit_contract_upgrade_guard.sql",
      ),
      "utf8",
    );

    let migrationError = "";
    try {
      await database.exec(migration);
    } catch (error) {
      migrationError = String(error);
    }

    const audit = await database.query<{
      entries: number;
      divergent_profiles: number;
    }>(`
      select
        count(*)::integer as entries,
        count(*) filter (where divergent_profile_count = 1)::integer
          as divergent_profiles
      from public.api_credit_cutover_upgrade_audit
    `);
    const profile = await database.query<{
      credits: number;
      credits_balance: number;
    }>(
      "select credits, credits_balance from public.profiles where user_id = 'upgrade-user'",
    );

    if (!migrationError.includes("approved attestation")) {
      throw new Error(
        `Expected an actionable upgrade gate, received: ${migrationError}`,
      );
    }
    if (
      audit.rows[0]?.entries !== 1 ||
      audit.rows[0]?.divergent_profiles !== 1
    ) {
      throw new Error(
        `Unexpected upgrade audit: ${JSON.stringify(audit.rows)}`,
      );
    }
    if (
      profile.rows[0]?.credits !== 40 ||
      profile.rows[0]?.credits_balance !== 25
    ) {
      throw new Error(
        `Upgrade gate mutated balances: ${JSON.stringify(profile.rows)}`,
      );
    }

    process.stdout.write(
      "upgrade gate audited the mismatch and preserved the divergent balances\n",
    );
  } finally {
    await database.close();
  }

  const creditsOnlyDatabase = new PGlite();
  try {
    await creditsOnlyDatabase.exec(`
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (
        version text primary key
      );
      insert into supabase_migrations.schema_migrations (version)
      values ('20260812090000');

      create role anon;
      create role authenticated;
      create role service_role;

      create table public.profiles (
        user_id text primary key,
        credits integer not null default 0
      );
      insert into public.profiles (user_id, credits)
      values ('credits-only-user', 40);

      create table public.credit_transactions (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        amount integer not null,
        related_id text,
        related_type text
      );
    `);

    const migration = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20260813074140_api_credit_contract_upgrade_guard.sql",
      ),
      "utf8",
    );
    await creditsOnlyDatabase.exec(migration);

    const profile = await creditsOnlyDatabase.query<{ credits: number }>(
      "select credits from public.profiles where user_id = 'credits-only-user'",
    );
    const state = await creditsOnlyDatabase.query<{
      legacy_column_preexisting: boolean;
      initial_reconciliation_completed: boolean;
    }>(`
      select legacy_column_preexisting, initial_reconciliation_completed
      from public.api_credit_balance_reconciliation_state
      where migration_key = '20260812090000_api_production_contract'
    `);
    const legacyColumn = await creditsOnlyDatabase.query<{ count: number }>(`
      select count(*)::integer as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'credits_balance'
    `);

    if (
      profile.rows[0]?.credits !== 40 ||
      state.rows[0]?.legacy_column_preexisting !== false ||
      state.rows[0]?.initial_reconciliation_completed !== true ||
      legacyColumn.rows[0]?.count !== 0
    ) {
      throw new Error(
        `Unexpected credits-only upgrade state: ${JSON.stringify({
          profile: profile.rows,
          state: state.rows,
          legacyColumn: legacyColumn.rows,
        })}`,
      );
    }

    process.stdout.write(
      "credits-only upgrade completed without a legacy mirror\n",
    );
  } finally {
    await creditsOnlyDatabase.close();
  }
}

void main();
