import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("billing pay-shell schema migration", () => {
  it("applies the canonical shell and reconciliation migrations", async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create table public.billing_checkout_intents (
          id uuid primary key,
          provider text not null,
          environment text not null,
          user_id text not null,
          product_snapshot jsonb not null,
          expected_amount_minor bigint not null,
          currency char(3) not null,
          status text not null
        );
        create table public.billing_payment_ledger (
          id uuid primary key,
          provider text not null,
          environment text not null,
          provider_resource_id text not null,
          checkout_intent_id uuid not null,
          user_id text not null,
          entry_kind text not null,
          amount_minor bigint not null,
          currency char(3) not null,
          customer_amount_minor bigint not null,
          customer_currency char(3) not null,
          status text not null,
          occurred_at timestamptz not null,
          metadata jsonb not null,
          unique(provider, environment, provider_resource_id)
        );
        create table public.billing_entitlement_grants (
          provider text not null,
          environment text not null,
          source_kind text not null,
          source_resource_id text not null,
          user_id text not null,
          feature_key text not null,
          valid_from timestamptz not null,
          valid_until timestamptz not null,
          status text not null,
          unique(provider, environment, source_kind, source_resource_id, feature_key)
        );
        create table public.billing_provider_events (
          id uuid primary key,
          provider text not null,
          environment text not null,
          event_id text not null
        );
      `);
      for (const name of [
        "20261002090000_billing_pay_shell_sessions.sql",
        "20261003120000_billing_provider_event_reference.sql",
        "20261003121000_billing_pay_shell_constraints.sql",
      ]) {
        const migration = await readFile(
          resolve(process.cwd(), `../../../../supabase/migrations/${name}`),
          "utf8",
        );
        await database.exec(migration);
      }

      const reference = await database.query<{ present: boolean }>(`
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'billing_provider_events'
          and column_name = 'provider_reference'
        ) as present
      `);
      const security = await database.query<{
        table_name: string;
        row_security: boolean;
        anon_select: boolean;
        service_insert: boolean;
      }>(`
        select c.relname as table_name, c.relrowsecurity as row_security,
          has_table_privilege('anon', c.oid, 'select') as anon_select,
          has_table_privilege('service_role', c.oid, 'insert') as service_insert
        from pg_class c
        where c.oid in ('public.billing_pay_shell_codes'::regclass,
                        'public.billing_pay_shell_sessions'::regclass)
        order by c.relname
      `);
      const index = await database.query<{ present: boolean }>(`
        select exists (
          select 1
          from pg_indexes
          where schemaname = 'public'
            and indexname = 'billing_provider_events_provider_reference_idx'
        ) as present
      `);
      const constraints = await database.query<{ conname: string }>(`
        select conname
        from pg_constraint
        where conname in (
          'billing_pay_shell_codes_account_intent_check',
          'billing_pay_shell_codes_expiry_order_check',
          'billing_pay_shell_sessions_account_intent_check',
          'billing_pay_shell_sessions_expiry_order_check'
        )
        order by conname
      `);

      expect(reference.rows[0]?.present).toBe(true);
      expect(index.rows[0]?.present).toBe(true);
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        "billing_pay_shell_codes_account_intent_check",
        "billing_pay_shell_codes_expiry_order_check",
        "billing_pay_shell_sessions_account_intent_check",
        "billing_pay_shell_sessions_expiry_order_check",
      ]);
      expect(security.rows).toEqual([
        {
          table_name: "billing_pay_shell_codes",
          row_security: true,
          anon_select: false,
          service_insert: true,
        },
        {
          table_name: "billing_pay_shell_sessions",
          row_security: true,
          anon_select: false,
          service_insert: true,
        },
      ]);
    } finally {
      await database.close();
    }
  });
});
