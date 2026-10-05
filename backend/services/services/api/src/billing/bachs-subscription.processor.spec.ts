import { BillingPayShellPersistence } from "./billing-pay-shell.persistence";
import { BillingReconciliationScheduler } from "./billing-reconciliation.scheduler";
jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
import { db } from "../db";
import { MonetizationService } from "../monetization/monetization.service";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BachsSubscriptionProcessor } from "./bachs-subscription.processor";
import type { BachsWebhookEvent } from "./providers/bachs/bachs-webhook.types";

jest.setTimeout(30_000);
const intentId = "11111111-1111-4111-8111-111111111111";
const processor = new BachsSubscriptionProcessor("sandbox");
const intent = {
  id: intentId,
  user_id: "user_1",
  product_key: "pro_monthly_pass",
  status: "open",
  currency: "USD",
  expected_amount_minor: "1500",
  product_snapshot: { renewalMode: "recurring", cadence: "monthly" },
};
function event(
  type: string,
  data: Record<string, unknown>,
  createdAt = "2026-10-05T12:00:00Z",
): BachsWebhookEvent {
  return {
    id: `evt_${type}`,
    type,
    data,
    createdAt,
    organizationId: "acct_edutu",
    environment: "sandbox",
  };
}
const subscription = {
  subscription_id: "sub_1",
  customer: { customer_id: "cust_1" },
  product_id: "prod_pro_monthly",
  status: "active",
  currency: "USD",
  amount: "15.00",
  billing_cycle: { interval: "month", frequency: 1 },
  quantity: 1,
  current_period_start: "2026-10-05T12:00:00Z",
  current_period_end: "2026-11-05T12:00:00Z",
  cancel_at_period_end: false,
  canceled_at: null,
};
const invoice = {
  invoice_id: "inv_1",
  subscription: { subscription_id: "sub_1" },
  customer: { customer_id: "cust_1" },
  status: "paid",
  currency: "USD",
  total: "15.00",
  amount_paid: "15.00",
  amount_remaining: "0.00",
  period_start: "2026-11-05T12:00:00Z",
  period_end: "2026-12-05T12:00:00Z",
};
let client: PGlite;
let tx: any;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(`
    create table billing_products(product_key text primary key, feature_key text, expected_amount_minor bigint,
      currency char(3), cadence text, renewal_mode text, enabled boolean, fulfillment_kind text,
      entitlement_duration interval, payment_method_policy jsonb, catalog_version int default 1, updated_at timestamptz default now());
    create table billing_product_provider_mappings(product_key text, provider text, environment text, provider_product_id text);
    create table billing_checkout_intents(id uuid primary key, user_id text, status text, provider text, environment text, product_snapshot jsonb, idempotency_key text, expires_at timestamptz, updated_at timestamptz default now());
    create table billing_provider_customers(id uuid default gen_random_uuid(), provider text, environment text,
      user_id text, provider_customer_id text, unique(provider,environment,user_id), unique(provider,environment,provider_customer_id));
    create table billing_provider_subscriptions(id uuid primary key default gen_random_uuid(), provider text, environment text,
      provider_subscription_id text, provider_customer_id text, user_id text, product_key text, status text, cadence text, provider_store text,
      current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean default false,
      canceled_at timestamptz, provider_updated_at timestamptz, updated_at timestamptz default now(),
      unique(provider,environment,provider_subscription_id));
    create table billing_entitlement_grants(id uuid default gen_random_uuid(), provider text, environment text, source_kind text,
      source_resource_id text, user_id text, feature_key text, valid_from timestamptz, valid_until timestamptz,
      status text, revoked_at timestamptz, revoke_reason text, updated_at timestamptz default now(),
      check(valid_until > valid_from), unique(provider,environment,source_kind,source_resource_id,feature_key));
    create table billing_payment_ledger(id uuid default gen_random_uuid(), provider text, environment text, provider_resource_id text,
      provider_event_id text, checkout_intent_id uuid, user_id text, entry_kind text, amount_minor bigint, currency char(3),
      customer_amount_minor bigint, customer_currency char(3), status text, occurred_at timestamptz, metadata jsonb,
      unique(provider,environment,provider_resource_id));
    insert into billing_products(product_key,feature_key,expected_amount_minor,currency,cadence,renewal_mode,enabled)
      values ('pro_monthly_pass','pro',1500,'USD','monthly','one_time',true),
             ('lite_yearly_pass','lite',10000,'USD','yearly','one_time',true);
    insert into billing_product_provider_mappings values ('pro_monthly_pass','bachs','sandbox','prod_pro_monthly');
  `);
  await client.exec(
    await readFile(
      resolve(
        process.cwd(),
        "../../../../supabase/migrations/20261005220804_bachs_recurring_consumer_plans.sql",
      ),
      "utf8",
    ),
  );
  await client.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.jwt() returns jsonb language sql as $$select '{"sub":"user_1"}'::jsonb$$;
    create function public.clerk_id_to_uuid(value text) returns text language sql as $$select value$$;
    create table profiles(user_id text, created_at timestamptz);
    insert into profiles values ('user_1',now());
    create table billing_entitlements(user_id text, feature_key text, status text, expires_at timestamptz,
      source text, metadata jsonb, updated_at timestamptz, unique(user_id,feature_key));`);
  await client.exec(
    await readFile(
      resolve(
        process.cwd(),
        "../../../../supabase/migrations/20261005222459_enforce_billing_grant_access_windows.sql",
      ),
      "utf8",
    ),
  );
  await client.exec(
    await readFile(
      resolve(
        process.cwd(),
        "../../../../supabase/migrations/20261005223143_isolate_live_billing_entitlements.sql",
      ),
      "utf8",
    ),
  );
  tx = drizzle(client);
});
afterAll(async () => {
  await client?.close();
});
beforeEach(async () => {
  await client.exec(`truncate billing_provider_subscriptions,billing_provider_customers,billing_entitlement_grants,billing_payment_ledger,billing_checkout_intents;
    insert into billing_checkout_intents(id,user_id,status) values ('${intentId}','user_1','open');`);
});
async function bind() {
  return processor.bindCheckout(
    tx,
    event("checkout.completed", {
      mode: "subscription",
      payment_status: "paid",
      amount: "15.00",
      currency: "USD",
      subscription: { subscription_id: "sub_1" },
      customer: { customer_id: "cust_1" },
      metadata: { edutu_user_id: "user_1" },
    }),
    intent,
  );
}

it("converts the yearly catalog price to exactly $99.99 and recurring access", async () => {
  const result = await client.query(
    "select expected_amount_minor,renewal_mode,entitlement_duration from billing_products where product_key='lite_yearly_pass'",
  );
  expect(result.rows[0]).toMatchObject({
    expected_amount_minor: 9999,
    renewal_mode: "recurring",
    entitlement_duration: null,
  });
});
it("binds checkout ownership without granting access from a checkout redirect event", async () => {
  expect(await bind()).toBeNull();
  expect(
    (await client.query("select * from billing_entitlement_grants")).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.query(
        "select user_id,status from billing_provider_subscriptions",
      )
    ).rows[0],
  ).toEqual({ user_id: "user_1", status: "pending" });
});
it("retries out-of-order lifecycle delivery until checkout ownership is known", async () => {
  await expect(
    processor.process(tx, event("customer.subscription.created", subscription)),
  ).rejects.toThrow("binding is pending");
});
it("activates a confirmed subscription and extends it once per paid invoice", async () => {
  await bind();
  expect(
    await processor.process(
      tx,
      event("customer.subscription.created", subscription),
    ),
  ).toBeNull();
  const paid = event("invoice.paid", invoice, "2026-11-05T12:00:01Z");
  expect(await processor.process(tx, paid)).toBeNull();
  expect(await processor.process(tx, paid)).toBeNull();
  const grant = (
    await client.query<any>(
      "select valid_until,status from billing_entitlement_grants",
    )
  ).rows[0];
  expect(new Date(grant.valid_until).toISOString()).toBe(
    "2026-12-05T12:00:00.000Z",
  );
  expect(grant.status).toBe("active");
  expect(
    (await client.query("select * from billing_payment_ledger")).rows,
  ).toHaveLength(1);
  expect(
    (await client.query("select status from billing_checkout_intents")).rows[0],
  ).toEqual({ status: "fulfilled" });
});
it("does not extend access on a failed renewal or undo an invoice already paid", async () => {
  await bind();
  await processor.process(
    tx,
    event("customer.subscription.created", subscription),
  );
  await processor.process(
    tx,
    event(
      "invoice.paid",
      {
        ...invoice,
        invoice_id: "inv_initial",
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      },
      "2026-10-05T12:00:01Z",
    ),
  );
  await processor.process(
    tx,
    event(
      "invoice.payment_failed",
      { ...invoice, status: "open", amount_paid: "0.00" },
      "2026-11-05T12:00:01Z",
    ),
  );
  const grant = (
    await client.query<any>(
      "select valid_until from billing_entitlement_grants",
    )
  ).rows[0];
  expect(new Date(grant.valid_until).toISOString()).toBe(
    "2026-11-05T12:00:00.000Z",
  );
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:02Z"),
  );
  await processor.process(
    tx,
    event(
      "invoice.payment_failed",
      { ...invoice, status: "open" },
      "2026-11-05T12:00:03Z",
    ),
  );
  expect(
    (await client.query("select status from billing_provider_subscriptions"))
      .rows[0],
  ).toEqual({ status: "active" });
});
it("revokes immediate cancellation and cannot resurrect it with a delayed invoice", async () => {
  await bind();
  await processor.process(
    tx,
    event("customer.subscription.created", subscription),
  );
  await processor.process(
    tx,
    event(
      "invoice.paid",
      {
        ...invoice,
        invoice_id: "inv_initial",
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      },
      "2026-10-05T12:00:01Z",
    ),
  );
  await processor.process(
    tx,
    event(
      "customer.subscription.deleted",
      {
        ...subscription,
        status: "canceled",
        canceled_at: "2026-10-06T12:00:00Z",
      },
      "2026-10-06T12:00:00Z",
    ),
  );
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:00Z"),
  );
  expect(
    (await client.query("select status from billing_entitlement_grants"))
      .rows[0],
  ).toEqual({ status: "revoked" });
});
it.each([
  [{ ...subscription, amount: "1.00" }, "subscription_price_mismatch"],
  [
    { ...subscription, billing_cycle: { interval: "year", frequency: 1 } },
    "subscription_product_mismatch",
  ],
  [
    { ...subscription, customer: { customer_id: "cust_other" } },
    "subscription_identity_mismatch",
  ],
])("rejects an unapproved subscription contract", async (data, reason) => {
  await bind();
  expect(
    await processor.process(tx, event("customer.subscription.created", data)),
  ).toBe(reason);
  expect(
    (await client.query("select * from billing_entitlement_grants")).rows,
  ).toHaveLength(0);
});

it("does not grant or extend access from unpaid lifecycle status", async () => {
  await bind();
  await processor.process(
    tx,
    event("customer.subscription.created", subscription),
  );
  expect(
    (await client.query("select * from billing_entitlement_grants")).rows,
  ).toHaveLength(0);
});
it("rejects a paid invoice with an excessive access period", async () => {
  await bind();
  expect(
    await processor.process(
      tx,
      event(
        "invoice.paid",
        {
          ...invoice,
          period_end: "2036-12-05T12:00:00Z",
        },
        "2026-11-05T12:00:01Z",
      ),
    ),
  ).toBe("invoice_period_invalid");
  expect(
    (await client.query("select * from billing_entitlement_grants")).rows,
  ).toHaveLength(0);
});
it("does not let a duplicate invoice change its access period", async () => {
  await bind();
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:01Z"),
  );
  await processor.process(
    tx,
    event(
      "invoice.paid",
      {
        ...invoice,
        period_start: "2026-12-05T12:00:00Z",
        period_end: "2027-01-05T12:00:00Z",
      },
      "2026-12-05T12:00:01Z",
    ),
  );
  const row = (
    await client.query<any>(
      "select valid_until from billing_entitlement_grants",
    )
  ).rows[0];
  expect(new Date(row.valid_until).toISOString()).toBe(
    "2026-12-05T12:00:00.000Z",
  );
});

it("retains late paid invoices in the ledger without restoring canceled access", async () => {
  await bind();
  await processor.process(
    tx,
    event(
      "customer.subscription.deleted",
      {
        ...subscription,
        status: "canceled",
        canceled_at: "2026-11-06T12:00:00Z",
      },
      "2026-11-06T12:00:00Z",
    ),
  );
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:01Z"),
  );
  expect(
    (await client.query("select * from billing_payment_ledger")).rows,
  ).toHaveLength(1);
  expect(
    (
      await client.query(
        "select * from billing_entitlement_grants where status='active'",
      )
    ).rows,
  ).toHaveLength(0);
});

it("denies access before the paid period and at its exact expiry", async () => {
  await bind();
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:01Z"),
  );
  await client.exec("update billing_entitlement_grants set environment='live'");
  for (const [at, expected] of [
    ["2026-11-05T11:59:59Z", false],
    ["2026-11-05T12:00:00Z", true],
    ["2026-12-05T12:00:00Z", false],
  ] as const) {
    const result = await client.query<any>(
      "select billing_has_active_pro_grant('user_1', $1::timestamptz) as active",
      [at],
    );
    expect(result.rows[0].active).toBe(expected);
    await client.query(
      "select billing_refresh_entitlement_projection('user_1','pro',$1::timestamptz)",
      [at],
    );
    expect(
      (
        await client.query<any>(
          "select status from billing_entitlements where user_id='user_1' and feature_key='pro'",
        )
      ).rows[0].status,
    ).toBe(expected ? "active" : "expired");
  }
});

it("records an older invoice without regressing a newer lifecycle period", async () => {
  await bind();
  await processor.process(
    tx,
    event(
      "customer.subscription.updated",
      {
        ...subscription,
        current_period_start: invoice.period_start,
        current_period_end: invoice.period_end,
      },
      "2026-11-05T12:00:02Z",
    ),
  );
  await processor.process(
    tx,
    event(
      "invoice.paid",
      {
        ...invoice,
        invoice_id: "inv_old",
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      },
      "2026-10-05T12:00:01Z",
    ),
  );
  const row = (
    await client.query<any>(
      "select current_period_start from billing_provider_subscriptions",
    )
  ).rows[0];
  expect(new Date(row.current_period_start).toISOString()).toBe(
    "2026-11-05T12:00:00.000Z",
  );
  expect(
    (await client.query("select * from billing_payment_ledger")).rows,
  ).toHaveLength(1);
  expect(
    (await client.query("select * from billing_entitlement_grants")).rows,
  ).toHaveLength(0);
});

it("blocks a second recurring checkout under a different idempotency key", async () => {
  const insert = `insert into billing_checkout_intents(id,user_id,status,provider,environment,product_snapshot,idempotency_key,expires_at)
    values ($1,'user_1','creating','bachs','sandbox','{"renewalMode":"recurring"}', $2, now()+interval '1 hour')`;
  await client.query(insert, ["22222222-2222-4222-8222-222222222222", "first"]);
  await expect(
    client.query(insert, ["33333333-3333-4333-8333-333333333333", "second"]),
  ).rejects.toThrow("already exists");
  // The same request can still reach the idempotent conflict handler.
  await client.query(insert, ["33333333-3333-4333-8333-333333333333", "first"]);
});
it("blocks a new recurring checkout while a failed subscription requires resolution", async () => {
  await bind();
  await client.exec(
    "update billing_provider_subscriptions set status='past_due'",
  );
  await expect(
    client.query(`insert into billing_checkout_intents(id,user_id,status,provider,environment,product_snapshot,idempotency_key,expires_at)
    values ('22222222-2222-4222-8222-222222222222','user_1','creating','bachs','sandbox','{"renewalMode":"recurring"}','new',now()+interval '1 hour')`),
  ).rejects.toThrow("already exists");
});

it("authorizes tools from current grants even if the derived cache is stale", async () => {
  await bind();
  const now = Date.now();
  await client.query(
    `insert into billing_entitlement_grants(provider,environment,source_kind,source_resource_id,user_id,feature_key,valid_from,valid_until,status)
    values ('bachs','live','subscription','sub_live','user_1','pro',$1,$2,'active')`,
    [new Date(now - 60000), new Date(now + 60000)],
  );
  await client.exec(
    "insert into billing_entitlements(user_id,feature_key,status,source) values ('user_1','pro','expired','derived_grants') on conflict(user_id,feature_key) do update set status='expired',source='derived_grants'",
  );
  (db.execute as jest.Mock).mockImplementation((query) => tx.execute(query));
  const service = new MonetizationService({} as any);
  expect(await (service as any).loadBilling("user_1")).toMatchObject({
    planTier: "pro",
    available: true,
  });
  await client.exec(
    "update billing_entitlement_grants set valid_from=now()+interval '1 minute',valid_until=now()+interval '2 minutes'",
  );
  expect(await (service as any).loadBilling("user_1")).toMatchObject({
    planTier: "none",
    available: true,
  });
  await client.exec(
    "update billing_entitlement_grants set valid_from=now()-interval '2 minutes',valid_until=now()-interval '1 minute'",
  );
  expect(await (service as any).loadBilling("user_1")).toMatchObject({
    planTier: "none",
    available: true,
  });
});

it("refreshes projection when time activates or expires an existing paid grant", async () => {
  await client.query(`insert into billing_entitlement_grants(provider,environment,source_kind,source_resource_id,user_id,feature_key,valid_from,valid_until,status)
    values ('bachs','live','subscription','sub_scheduled','user_1','pro',now()-interval '1 minute',now()+interval '1 minute','active')`);
  await client.exec(
    "insert into billing_entitlements(user_id,feature_key,status,source) values ('user_1','pro','expired','derived_grants') on conflict(user_id,feature_key) do update set status='expired',source='derived_grants'",
  );
  (db.execute as jest.Mock).mockImplementation((query) => tx.execute(query));
  const scheduler = new BillingReconciliationScheduler({} as any);
  await scheduler.refreshGrantWindows();
  expect(
    (
      await client.query<any>(
        "select status from billing_entitlements where user_id='user_1' and feature_key='pro'",
      )
    ).rows[0].status,
  ).toBe("active");
  await client.exec(
    "update billing_entitlement_grants set valid_from=now()-interval '2 minutes',valid_until=now()-interval '1 minute'",
  );
  await scheduler.refreshGrantWindows();
  expect(
    (
      await client.query<any>(
        "select status from billing_entitlements where user_id='user_1' and feature_key='pro'",
      )
    ).rows[0].status,
  ).toBe("expired");
});

it("reports recurring account access only for an actual started paid grant", async () => {
  await bind();
  await client.exec(
    "update billing_provider_subscriptions set status='active'",
  );
  const account = new BillingPayShellPersistence(tx);
  expect((await account.account("user_1", "sandbox"))[0].status).toBe(
    "expired",
  );
  await client.exec(`insert into billing_entitlement_grants(provider,environment,source_kind,source_resource_id,user_id,feature_key,valid_from,valid_until,status)
    values ('bachs','sandbox','subscription','sub_1','user_1','pro',now()+interval '1 minute',now()+interval '2 minutes','active')`);
  expect((await account.account("user_1", "sandbox"))[0].status).toBe(
    "expired",
  );
  await client.exec(
    "update billing_entitlement_grants set valid_from=now()-interval '1 minute'",
  );
  expect((await account.account("user_1", "sandbox"))[0].status).toBe("active");
  await client.exec("update billing_entitlement_grants set status='revoked'");
  expect((await account.account("user_1", "sandbox"))[0].status).toBe(
    "expired",
  );
});

it("does not project sandbox grants into live paid access", async () => {
  await bind();
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:01Z"),
  );
  const row = (
    await client.query<any>(
      "select billing_has_active_pro_grant('user_1','2026-11-06'::timestamptz) as active",
    )
  ).rows[0];
  expect(row.active).toBe(false);
  await client.exec(
    "select billing_refresh_entitlement_projection('user_1','pro','2026-11-06'::timestamptz)",
  );
  expect(
    (
      await client.query<any>(
        "select status from billing_entitlements where user_id='user_1' and feature_key='pro'",
      )
    ).rows[0].status,
  ).toBe("expired");
});

it("honors terminal cancellation even when a newer invoice arrived first", async () => {
  await bind();
  await processor.process(
    tx,
    event("invoice.paid", invoice, "2026-11-05T12:00:01Z"),
  );
  await processor.process(
    tx,
    event(
      "customer.subscription.deleted",
      {
        ...subscription,
        status: "canceled",
        canceled_at: "2026-10-06T12:00:00Z",
      },
      "2026-10-06T12:00:00Z",
    ),
  );
  expect(
    (
      await client.query<any>(
        "select status from billing_provider_subscriptions",
      )
    ).rows[0].status,
  ).toBe("canceled");
  expect(
    (await client.query<any>("select status from billing_entitlement_grants"))
      .rows[0].status,
  ).toBe("revoked");
});
