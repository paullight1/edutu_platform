import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fulfillLegacyCreditPurchase,
  fulfillOneTimePurchase,
  handleOneTimePurchase,
  normalizeStore,
  consumerTierForSubscription,
  isActiveEntitlement,
  shouldProcessProviderEvent,
} from "./index.ts";

Deno.test("normalizes RevenueCat store values to the legacy billing schema", () => {
  assertEquals(normalizeStore("APP_STORE"), "app_store");
  assertEquals(normalizeStore("PLAY_STORE"), "play_store");
  assertEquals(normalizeStore("STRIPE"), "stripe");
  assertEquals(normalizeStore("UNKNOWN_STORE"), null);
  assertEquals(normalizeStore(undefined), null);
});

Deno.test("maps all consumer RevenueCat products to the correct paid tier", () => {
  const base = {
    app_user_id: "user_1",
    transaction_id: "txn_1",
    store: "APP_STORE",
    price: 10,
    currency: "USD",
    period_type: "NORMAL",
    is_trial_conversion: false,
    expiration_at_ms: String(Date.now() + 86_400_000),
    environment: "PRODUCTION",
  };
  assertEquals(consumerTierForSubscription({ ...base, product_id: "lite_monthly" }), "lite");
  assertEquals(consumerTierForSubscription({ ...base, product_id: "pro_monthly" }), "pro");
  assertEquals(consumerTierForSubscription({ ...base, product_id: "scholar_monthly" }), "scholar");
  assertEquals(consumerTierForSubscription({ ...base, product_id: "unknown" }), null);
});

Deno.test("treats perpetual active entitlements as active", () => {
  assertEquals(isActiveEntitlement({ status: "active", expires_at: null }), true);
  assertEquals(isActiveEntitlement({ status: "expired", expires_at: null }), false);
  assertEquals(isActiveEntitlement({ status: "active", expires_at: new Date(Date.now() - 1_000).toISOString() }), false);
});

Deno.test("fulfills a canonical credit pack through the atomic billing RPC", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: { fulfilled: true, credit_quantity: 100 },
        error: null,
      });
    },
    from() {
      throw new Error(
        "canonical fulfillment must not start a legacy pending purchase",
      );
    },
  };

  const result = await fulfillOneTimePurchase(client, "user_123", {
    product_id: "credits_100",
    transaction_id: "txn_credit_123",
    price: 4.99,
    currency: "usd",
    environment: "PRODUCTION",
  }, "2026-08-12T10:00:00.000Z");

  assertEquals(result, {
    fulfilled: true,
    duplicate: false,
    rail: "canonical",
  });
  assertEquals(rpcCalls, [{
    name: "billing_fulfill_credit_pack",
    args: {
      p_provider: "revenuecat",
      p_environment: "live",
      p_provider_resource_id: "txn_credit_123",
      p_user_id: "user_123",
      p_product_key: "credits_100",
      p_amount_minor: 499,
      p_currency: "USD",
      p_occurred_at: "2026-08-12T10:00:00.000Z",
    },
  }]);
});

Deno.test("fulfills a season pass atomically before acknowledging its event", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: { fulfilled: true }, error: null });
    },
    from() {
      throw new Error(
        "canonical fulfillment must not use the legacy season-pass write sequence",
      );
    },
  };

  const result = await fulfillOneTimePurchase(client, "user_456", {
    product_id: "season_pass",
    transaction_id: "txn_season_456",
    price: 19.99,
    currency: "USD",
    environment: "SANDBOX",
  }, "2026-08-12T11:00:00.000Z");

  assertEquals(result, {
    fulfilled: true,
    duplicate: false,
    rail: "canonical",
  });
  assertEquals(rpcCalls, [{
    name: "billing_fulfill_one_time_purchase",
    args: {
      p_provider: "revenuecat",
      p_environment: "sandbox",
      p_provider_resource_id: "txn_season_456",
      p_user_id: "user_456",
      p_product_key: "season_pass",
      p_amount_minor: 1999,
      p_currency: "USD",
      p_occurred_at: "2026-08-12T11:00:00.000Z",
    },
  }]);
});

Deno.test("recovers a pending legacy credit purchase without granting credits twice", async () => {
  const completedPurchases: Array<Record<string, unknown>> = [];
  const client = {
    rpc() {
      throw new Error(
        "a settled legacy credit ledger must not be granted again",
      );
    },
    from(table: string) {
      if (table === "credit_purchases") {
        return {
          insert: () =>
            Promise.resolve({
              error: { code: "23505", message: "duplicate key" },
            }),
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "user_789",
                    status: "pending",
                    credits_granted: 0,
                  },
                  error: null,
                }),
            }),
          }),
          update: (row: Record<string, unknown>) => ({
            eq: () => {
              completedPurchases.push(row);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "credit_transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "credit_ledger_789" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const result = await fulfillLegacyCreditPurchase(client, "user_789", {
    product_id: "credits_small",
    transaction_id: "txn_legacy_789",
    price: 4.99,
    currency: "USD",
    store: "APP_STORE",
  });

  assertEquals(result, {
    fulfilled: true,
    duplicate: false,
    rail: "legacy-recovered",
  });
  assertEquals(completedPurchases.length, 1);
  assertEquals(completedPurchases[0].credits_granted, 50);
  assertEquals(completedPurchases[0].status, "completed");
});

Deno.test("routes canonical one-time webhook events through the atomic fulfillment rail", async () => {
  const client = {
    rpc(name: string) {
      assertEquals(name, "billing_fulfill_credit_pack");
      return Promise.resolve({ data: { fulfilled: true }, error: null });
    },
    from() {
      throw new Error(
        "legacy tables must not be used for canonical one-time products",
      );
    },
  };

  const result = await handleOneTimePurchase(client, "user_100", {
    product_id: "credits_100",
    transaction_id: "txn_100",
    price: 4.99,
    currency: "USD",
    environment: "PRODUCTION",
  }, "2026-08-12T12:00:00.000Z");

  assertEquals(result, {
    fulfilled: true,
    duplicate: false,
    rail: "canonical",
  });
});

Deno.test("retries nonterminal durable webhook receipts instead of leaving claims stuck", () => {
  assertEquals(shouldProcessProviderEvent("received"), true);
  assertEquals(shouldProcessProviderEvent("processing"), true);
  assertEquals(shouldProcessProviderEvent("failed"), true);
  assertEquals(shouldProcessProviderEvent("processed"), false);
});
