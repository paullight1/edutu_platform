import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimProviderEvent,
  fulfillLegacyCreditPurchase,
  fulfillOneTimePurchase,
  handleOneTimePurchase,
  markProviderEvent,
  normalizeStore,
  shouldProcessProviderEvent,
} from "./index.ts";

type EventRow = {
  provider: string;
  environment: "sandbox" | "live";
  eventId: string;
  status: "processing" | "failed" | "processed";
  claimToken: string;
  leaseExpiresAt: number;
};

class AtomicProviderEventStore {
  private rowByIdentity = new Map<string, EventRow>();
  private tokenSequence = 0;

  rpc(name: string, args: Record<string, unknown>) {
    if (name === "claim_billing_provider_event") {
      const identity = [
        args.p_provider,
        args.p_environment,
        args.p_event_id,
      ].join(":");
      const existing = this.rowByIdentity.get(identity);
      if (
        existing &&
        (existing.status === "processed" ||
          existing.leaseExpiresAt > Date.now())
      ) {
        return Promise.resolve({ data: { claimed: false }, error: null });
      }

      const claimToken = `claim-${++this.tokenSequence}`;
      this.rowByIdentity.set(identity, {
        provider: String(args.p_provider),
        environment: args.p_environment as "sandbox" | "live",
        eventId: String(args.p_event_id),
        status: "processing",
        claimToken,
        leaseExpiresAt: Date.now() + 60_000,
      });
      return Promise.resolve({
        data: { claimed: true, claim_token: claimToken },
        error: null,
      });
    }

    const identity = [
      args.p_provider,
      args.p_environment,
      args.p_event_id,
    ].join(":");
    const row = this.rowByIdentity.get(identity);
    if (
      !row ||
      row.claimToken !== args.p_claim_token ||
      row.leaseExpiresAt <= Date.now()
    ) {
      return Promise.resolve({ data: false, error: null });
    }

    if (name === "complete_billing_provider_event") {
      if (row.status !== "processing") {
        return Promise.resolve({ data: false, error: null });
      }
      row.status = "processed";
      row.leaseExpiresAt = 0;
      return Promise.resolve({ data: true, error: null });
    }

    if (name === "fail_billing_provider_event") {
      if (row.status !== "processing") {
        return Promise.resolve({ data: false, error: null });
      }
      row.status = "failed";
      row.leaseExpiresAt = 0;
      return Promise.resolve({ data: true, error: null });
    }

    throw new Error(`Unexpected RPC: ${name}`);
  }

  expire(identity: string) {
    const row = this.rowByIdentity.get(identity);
    if (row) row.leaseExpiresAt = 0;
  }
}

const claimInput = {
  eventId: "evt_concurrent_123",
  eventType: "NON_RENEWING_PURCHASE",
  userId: "user_concurrent_123",
  environment: "live" as const,
  rawBody: JSON.stringify({ event: { id: "evt_concurrent_123" } }),
};

type ClaimInput = {
  eventId: string;
  eventType: string;
  userId: string;
  environment: "sandbox" | "live";
  rawBody: string;
};

function claim(store: AtomicProviderEventStore, input: ClaimInput = claimInput) {
  return claimProviderEvent(
    store as any,
    input.eventId,
    input.eventType,
    input.userId,
    input.environment,
    input.rawBody,
  );
}

Deno.test("allows only one concurrent claim and rejects stale completion/failure", async () => {
  const store = new AtomicProviderEventStore();
  const claims = await Promise.all([
    claim(store),
    claim(store),
  ]);

  assertEquals(claims.filter((claim) => claim.claimed).length, 1);
  const firstClaim = claims.find((claim) => claim.claimed);
  if (!firstClaim?.claimToken) throw new Error("expected an active claim token");

  store.expire("revenuecat:live:evt_concurrent_123");
  const replacementClaim = await claim(store);
  if (!replacementClaim.claimToken) {
    throw new Error("expected stale claim to be replaced");
  }

  assertEquals(
    await markProviderEvent(
      store as any,
      claimInput.eventId,
      claimInput.environment,
      "processed",
      firstClaim.claimToken,
    ),
    false,
  );
  assertEquals(
    await markProviderEvent(
      store as any,
      claimInput.eventId,
      claimInput.environment,
      "failed",
      firstClaim.claimToken,
      new Error("stale owner failure"),
    ),
    false,
  );
  assertEquals(
    await markProviderEvent(
      store as any,
      claimInput.eventId,
      claimInput.environment,
      "processed",
      replacementClaim.claimToken,
    ),
    true,
  );
});

Deno.test("scopes duplicate identity by provider and environment", async () => {
  const store = new AtomicProviderEventStore();
  const liveClaim = await claim(store);
  const sandboxClaim = await claim(store, {
    ...claimInput,
    environment: "sandbox",
  });

  assertEquals(liveClaim.claimed, true);
  assertEquals(sandboxClaim.claimed, true);
  assertEquals(
    (await claim(store)).claimed,
    false,
  );
});

Deno.test("normalizes RevenueCat store values to the legacy billing schema", () => {
  assertEquals(normalizeStore("APP_STORE"), "app_store");
  assertEquals(normalizeStore("PLAY_STORE"), "play_store");
  assertEquals(normalizeStore("STRIPE"), "stripe");
  assertEquals(normalizeStore("UNKNOWN_STORE"), null);
  assertEquals(normalizeStore(undefined), null);
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

Deno.test("canonical claim migration is an owner-bound service-only lease", async () => {
  const migrationUrl = new URL(
    "../../migrations/20260813120423_atomic_provider_event_claim.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(migrationUrl);

  assertEquals(/security invoker/i.test(sql), true);
  assertEquals(/set search_path\s*=\s*pg_catalog, public/i.test(sql), true);
  assertEquals(
    /on conflict\s*\(provider, environment, event_id\)\s*do update/i.test(sql),
    true,
  );
  assertEquals(/lease_expires_at\s*>\s*now\(\)/i.test(sql), true);
  assertEquals(/claim_token\s*=\s*p_claim_token/i.test(sql), true);
  assertEquals(/grant execute on function[\s\S]*to service_role/i.test(sql), true);
});
