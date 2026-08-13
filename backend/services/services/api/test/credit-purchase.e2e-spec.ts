import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { API_CREDIT_PRODUCT_QUANTITIES } from "../src/billing/types/billing-checkout.types";
import {
  CreditPurchaseService,
  type CreditPurchaseDatabase,
  type CreditPurchaseTransaction,
  type VerifiedCreditPurchase,
} from "../src/billing/credit-purchase.service";

const dialect = new PgDialect();

async function execute(database: PGlite, statement: SQL) {
  const query = dialect.sqlToQuery(statement);
  return database.query(query.sql, query.params);
}

async function disposableBillingDatabase() {
  const database = new PGlite();
  await database.exec(`
    create or replace function public.clerk_id_to_uuid(p_id text)
    returns uuid
    language sql
    immutable
    as $$
      select case
        when p_id ~ '^[0-9a-fA-F-]{36}$' then p_id::uuid
        else '00000000-0000-0000-0000-000000000000'::uuid
      end
    $$;
    create table public.profiles (
      user_id text primary key,
      credits integer not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.billing_provider_events (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      environment text not null,
      event_id text not null,
      event_type text not null,
      received_at timestamptz not null default now(),
      status text not null,
      payload_hash text not null,
      raw_payload jsonb not null,
      processed_at timestamptz,
      last_error text,
      updated_at timestamptz not null default now(),
      unique (provider, environment, event_id)
    );
    create table public.credit_transactions (
      id bigint generated always as identity primary key,
      user_id text not null,
      amount integer not null,
      type text not null,
      description text,
      related_id text,
      related_type text,
      metadata jsonb not null default '{}'::jsonb
    );
    create unique index credit_purchase_replay_unique
      on public.credit_transactions (related_type, related_id)
      where related_id is not null
        and related_type in ('api_request', 'api_credit_purchase');
    create table public.billing_review_cases (
      id bigint generated always as identity primary key,
      event_id text not null,
      case_type text not null,
      details jsonb not null default '{}'::jsonb
    );
    insert into public.profiles (user_id, credits) values ('00000000-0000-0000-0000-000000000000', 0);
  `);

  const transaction: CreditPurchaseTransaction = {
    execute: (statement) => execute(database, statement),
  };
  const databaseAdapter: CreditPurchaseDatabase = {
    transaction: async <T>(
      callback: (tx: CreditPurchaseTransaction) => Promise<T>,
    ) => {
      await database.exec("begin");
      try {
        const result = await callback(transaction);
        await database.exec("commit");
        return result;
      } catch (error) {
        await database.exec("rollback");
        throw error;
      }
    },
  };

  return { database, databaseAdapter };
}

function purchase(
  eventId: string,
  providerReference: string,
): VerifiedCreditPurchase {
  return {
    provider: "bachs",
    environment: "sandbox",
    eventId,
    providerReference,
    userId: "00000000-0000-0000-0000-000000000000",
    productKey: "api_credits_100",
    creditQuantity: API_CREDIT_PRODUCT_QUANTITIES.api_credits_100,
    amountMinor: 1500,
    currency: "NGN",
  };
}

describe("one-time API credit purchase (PGlite fixture)", () => {
  it("fulfills a signed-delivery equivalent once and ignores a webhook replay", async () => {
    const { database, databaseAdapter } = await disposableBillingDatabase();
    try {
      const service = new CreditPurchaseService(databaseAdapter);
      const first = await service.fulfill(purchase("event-1", "charge-1"), {
        eventType: "collection.succeeded",
        payload: { fixture: true },
      });
      const replay = await service.fulfill(purchase("event-1", "charge-1"), {
        eventType: "collection.succeeded",
        payload: { fixture: true },
      });

      const profile = await database.query<{ credits: number }>(
        "select credits from public.profiles where user_id = '00000000-0000-0000-0000-000000000000'",
      );
      const ledger = await database.query<{ entries: number }>(
        "select count(*)::integer as entries from public.credit_transactions where related_type = 'api_credit_purchase'",
      );
      const event = await database.query<{ status: string }>(
        "select status from public.billing_provider_events where event_id = 'event-1'",
      );

      expect(first).toMatchObject({
        status: "fulfilled",
        creditsAdded: 100,
      });
      expect(replay).toEqual({
        status: "duplicate",
        creditsAdded: 0,
        ledgerId: null,
      });
      expect(profile.rows[0]?.credits).toBe(100);
      expect(ledger.rows[0]?.entries).toBe(1);
      expect(event.rows[0]?.status).toBe("processed");
    } finally {
      await database.close();
    }
  });

  it("keeps API credit packs one-time and non-expiring in the product contract", () => {
    expect(API_CREDIT_PRODUCT_QUANTITIES).toEqual({
      api_credits_100: 100,
      api_credits_250: 250,
      api_credits_700: 700,
    });
    expect(
      Object.values(API_CREDIT_PRODUCT_QUANTITIES).every(
        (quantity) => quantity > 0,
      ),
    ).toBe(true);

    const productSnapshot = {
      fulfillmentKind: "credits",
      renewalMode: "one_time",
      validityDays: null,
    };
    expect(productSnapshot).toEqual({
      fulfillmentKind: "credits",
      renewalMode: "one_time",
      validityDays: null,
    });
  });

  it("routes malformed quantity deliveries to review without crediting the profile", async () => {
    const { database, databaseAdapter } = await disposableBillingDatabase();
    try {
      const service = new CreditPurchaseService(databaseAdapter);
      const result = await service.fulfill(
        {
          ...purchase("event-bad", "charge-bad"),
          creditQuantity: 999,
        },
        { eventType: "collection.succeeded", payload: { fixture: true } },
      );
      const profile = await database.query<{ credits: number }>(
        "select credits from public.profiles where user_id = '00000000-0000-0000-0000-000000000000'",
      );
      const review = await database.query<{ case_type: string }>(
        "select case_type from public.billing_review_cases where event_id = (select id::text from public.billing_provider_events where event_id = 'event-bad')",
      );

      expect(result).toEqual({
        status: "review",
        creditsAdded: 0,
        ledgerId: null,
      });
      expect(profile.rows[0]?.credits).toBe(0);
      expect(review.rows[0]?.case_type).toBe("api_product_quantity_mismatch");
    } finally {
      await database.close();
    }
  });
});
