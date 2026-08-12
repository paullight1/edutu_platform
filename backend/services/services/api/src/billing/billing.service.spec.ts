import { BadRequestException } from "@nestjs/common";
import { createHmac } from "crypto";
import { BillingService } from "./billing.service";
import { SettingsService } from "../settings/settings.service";
import { DEFAULT_ADMIN_SETTINGS } from "../settings/settings.dto";

// Settings stub: hand the service the default (NGN) pricing config.
const settingsStub = {
  getSettings: async () => ({
    success: true,
    source: "database" as const,
    settings: DEFAULT_ADMIN_SETTINGS,
  }),
} as unknown as SettingsService;

const PRO_SINCE_ISO = new Date(
  Date.now() - 30 * 24 * 3600 * 1000,
).toISOString();
// Always in the future so isPro stays true regardless of when tests run.
const PRO_EXPIRES_ISO = new Date(
  Date.now() + 30 * 24 * 3600 * 1000,
).toISOString();

describe("BillingService", () => {
  const originalEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    BILLING_PUBLIC_URL: process.env.BILLING_PUBLIC_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    ADMIN_URL: process.env.ADMIN_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    BACHS_WEBHOOK_SECRET: process.env.BACHS_WEBHOOK_SECRET,
  };

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalEnv.PAYSTACK_SECRET_KEY;
    process.env.BILLING_PUBLIC_URL = originalEnv.BILLING_PUBLIC_URL;
    process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
    process.env.ADMIN_URL = originalEnv.ADMIN_URL;
    process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      originalEnv.SUPABASE_SERVICE_ROLE_KEY;
    process.env.BACHS_WEBHOOK_SECRET = originalEnv.BACHS_WEBHOOK_SECRET;
    jest.restoreAllMocks();
  });

  function createSupabaseMock() {
    const profileResult = {
      data: {
        is_pro: true,
        pro_since: PRO_SINCE_ISO,
        pro_expires_at: PRO_EXPIRES_ISO,
        // profiles.credits is the real authoritative balance column
        // (there is no credits_balance column in the live DB).
        credits: 1200,
      },
      error: null,
    };

    const entitlementResult = {
      data: [
        {
          feature_key: "pro",
          expires_at: PRO_EXPIRES_ISO,
          status: "active",
        },
      ],
      error: null,
    };

    const subscriptionResult = {
      data: {
        status: "active",
        current_period_end: PRO_EXPIRES_ISO,
      },
      error: null,
    };

    const transactionResult = {
      data: [
        {
          id: "txn-1",
          provider: "paystack",
          provider_reference: "ref_123",
          type: "credit_topup",
          amount: 1000,
          currency: "NGN",
          status: "completed",
          metadata: { feature: "api_credits" },
          created_at: "2026-06-22T10:00:00.000Z",
        },
      ],
      error: null,
    };

    const createQuery = (result: any) => ({
      select: () => createQuery(result),
      eq: () => createQuery(result),
      order: () => createQuery(result),
      limit: () => createQuery(result),
      maybeSingle: () => Promise.resolve(result),
      then: (
        resolve: (value: any) => unknown,
        reject: (reason?: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
    });

    return {
      from: (table: string) => {
        switch (table) {
          case "profiles":
            return createQuery(profileResult);
          case "billing_entitlements":
            return createQuery(entitlementResult);
          case "billing_subscriptions":
            return createQuery(subscriptionResult);
          case "billing_transactions":
            return createQuery(transactionResult);
          default:
            return createQuery({ data: [], error: null });
        }
      },
    };
  }

  // ─── Subscription-renewal webhook harness ────────────────────────────────
  // Captures every write the webhook makes so the tests can assert the exact
  // expiry that landed in each of the three tables that must agree.
  type WebhookWrites = {
    entitlement: any;
    subscription: any;
    profile: any;
  };

  function createWebhookSupabaseMock(existingEntitlement: any) {
    const writes: WebhookWrites = {
      entitlement: null,
      subscription: null,
      profile: null,
    };

    // Read chain for the pre-existing entitlement (select→eq→eq→maybeSingle).
    const readQuery = (result: any): any => ({
      select: () => readQuery(result),
      eq: () => readQuery(result),
      maybeSingle: () => Promise.resolve(result),
    });

    const supabase = {
      from: (table: string) => {
        if (table === "billing_entitlements") {
          return {
            ...readQuery({ data: existingEntitlement, error: null }),
            upsert: (row: any) => {
              writes.entitlement = row;
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        if (table === "billing_subscriptions") {
          return {
            upsert: (row: any) => {
              writes.subscription = row;
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        if (table === "profiles") {
          return {
            update: (row: any) => {
              writes.profile = row;
              return { eq: () => Promise.resolve({ data: null, error: null }) };
            },
          };
        }
        return {
          upsert: () => Promise.resolve({ data: null, error: null }),
        };
      },
    };

    return { supabase, writes };
  }

  // Drives handlePaystackWebhook with a correctly signed charge.success body.
  async function runRenewalWebhook(options: {
    plan: string;
    existingEntitlement: any;
  }) {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    const payload = {
      event: "charge.success",
      data: {
        reference: "ref_renewal_1",
        amount: 650000,
        currency: "NGN",
        customer: { customer_code: "CUS_1" },
        metadata: { user_id: "user-1", plan: options.plan, feature: "pro" },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac("sha512", "sk_test_123")
      .update(rawBody)
      .digest("hex");

    const { supabase, writes } = createWebhookSupabaseMock(
      options.existingEntitlement,
    );
    const service = new BillingService(settingsStub);
    (service as any).supabase = supabase;

    const result = await service.handlePaystackWebhook(
      rawBody,
      payload,
      signature,
    );
    return { result, writes };
  }

  it("EXTENDS an existing entitlement on renewal instead of resetting it", async () => {
    // 300 days of paid time left — a monthly renewal must land at 300 + 31,
    // not at 31. This is the money-losing regression this test exists for.
    const existingExpiry = new Date(Date.now() + 300 * 24 * 3600 * 1000);
    const { result, writes } = await runRenewalWebhook({
      plan: "monthly",
      existingEntitlement: {
        status: "active",
        expires_at: existingExpiry.toISOString(),
      },
    });

    expect(result).toMatchObject({ received: true });

    const granted = new Date(writes.entitlement.expires_at);
    const addedDays = Math.round(
      (granted.getTime() - existingExpiry.getTime()) / (24 * 3600 * 1000),
    );
    expect(addedDays).toBe(31);
    // Sanity: nowhere near the "reset to now + 31" the bug produced.
    const daysFromNow = Math.round(
      (granted.getTime() - Date.now()) / (24 * 3600 * 1000),
    );
    expect(daysFromNow).toBe(331);

    // All three writes must carry the same extended expiry.
    expect(writes.subscription.current_period_end).toBe(
      writes.entitlement.expires_at,
    );
    expect(writes.profile.pro_expires_at).toBe(writes.entitlement.expires_at);
    expect(writes.profile.is_pro).toBe(true);
  });

  it("extends a weekly renewal by exactly 7 days from the remaining expiry", async () => {
    const existingExpiry = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const { writes } = await runRenewalWebhook({
      plan: "weekly",
      existingEntitlement: {
        status: "active",
        expires_at: existingExpiry.toISOString(),
      },
    });

    const addedDays = Math.round(
      (new Date(writes.entitlement.expires_at).getTime() -
        existingExpiry.getTime()) /
        (24 * 3600 * 1000),
    );
    expect(addedDays).toBe(7);
  });

  it("grants a yearly plan 366 days from now for a first-time subscriber", async () => {
    const { writes } = await runRenewalWebhook({
      plan: "yearly",
      existingEntitlement: null,
    });

    const daysFromNow = Math.round(
      (new Date(writes.entitlement.expires_at).getTime() - Date.now()) /
        (24 * 3600 * 1000),
    );
    expect(daysFromNow).toBe(366);
  });

  it("ignores expired or revoked entitlements and grants from now", async () => {
    // Revoked row that still carries a future expires_at — dead time must not
    // be resurrected, so the grant is measured from now.
    const { writes } = await runRenewalWebhook({
      plan: "monthly",
      existingEntitlement: {
        status: "revoked",
        expires_at: new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString(),
      },
    });

    const daysFromNow = Math.round(
      (new Date(writes.entitlement.expires_at).getTime() - Date.now()) /
        (24 * 3600 * 1000),
    );
    expect(daysFromNow).toBe(31);
  });

  it("grants from now when the stored entitlement already lapsed", async () => {
    const { writes } = await runRenewalWebhook({
      plan: "monthly",
      existingEntitlement: {
        status: "active",
        expires_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      },
    });

    const daysFromNow = Math.round(
      (new Date(writes.entitlement.expires_at).getTime() - Date.now()) /
        (24 * 3600 * 1000),
    );
    expect(daysFromNow).toBe(31);
  });

  it("initializes an API credits checkout with the correct Paystack metadata", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    process.env.BILLING_PUBLIC_URL = "https://app.edutu.org";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://paystack.example/checkout",
          access_code: "ac_123",
        },
      }),
    } as any);

    const service = new BillingService(settingsStub);
    const result = await service.createCheckout("user-1", "dev@example.com", {
      feature: "api_credits",
      credits: 1500,
      returnTo: "/developers",
    });

    expect(result).toMatchObject({
      provider: "paystack",
      configured: true,
      authorizationUrl: "https://paystack.example/checkout",
      accessCode: "ac_123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse(String(requestInit?.body));
    expect(parsedBody).toMatchObject({
      email: "dev@example.com",
      amount: 150000,
      currency: "NGN",
      metadata: {
        user_id: "user-1",
        feature: "api_credits",
        credits: 1500,
        return_to: "/developers",
      },
    });
  });

  it("accepts a valid Bachs webhook signature", async () => {
    process.env.BACHS_WEBHOOK_SECRET = "bachs_webhook_test_secret";
    const payload = { id: "evt_123", type: "checkout.completed", data: {} };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.BACHS_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest("hex");

    const service = new BillingService(settingsStub);
    await expect(
      service.handleBachsWebhook(rawBody, payload, timestamp, signature),
    ).resolves.toMatchObject({ received: true, ignored: true });
  });

  it("rejects a Bachs webhook with an invalid signature", async () => {
    process.env.BACHS_WEBHOOK_SECRET = "bachs_webhook_test_secret";
    const payload = { id: "evt_123", type: "checkout.completed", data: {} };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));

    const service = new BillingService(settingsStub);
    await expect(
      service.handleBachsWebhook(rawBody, payload, timestamp, "not-valid"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns an unconfigured response when Paystack is missing", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const service = new BillingService(settingsStub);
    const result = await service.createCheckout("user-1", "dev@example.com", {
      feature: "api_credits",
      credits: 1000,
    });

    expect(result).toMatchObject({
      provider: "paystack",
      configured: false,
    });
    expect("message" in result ? result.message : "").toContain(
      "PAYSTACK_SECRET_KEY is not configured",
    );
  });

  it("rejects webhook payloads with an invalid Paystack signature", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";

    const service = new BillingService(settingsStub);
    await expect(
      service.handlePaystackWebhook(
        Buffer.from(
          JSON.stringify({
            event: "charge.success",
            data: {
              reference: "ref_123",
              amount: 100000,
              currency: "NGN",
              metadata: {
                user_id: "user-1",
                feature: "api_credits",
                credits: 1000,
              },
            },
          }),
        ),
        {
          event: "charge.success",
          data: {
            reference: "ref_123",
            amount: 100000,
            currency: "NGN",
            metadata: {
              user_id: "user-1",
              feature: "api_credits",
              credits: 1000,
            },
          },
        },
        "invalid-signature",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("includes recent billing transactions on billing status responses", async () => {
    const service = new BillingService(settingsStub);
    (service as any).supabase = createSupabaseMock();

    const status = await service.getStatus("user-1");

    expect(status).toMatchObject({
      isPro: true,
      proSince: PRO_SINCE_ISO,
      proExpiresAt: PRO_EXPIRES_ISO,
      credits: 1200,
      subscriptionStatus: "active",
    });
    expect(status.transactions).toHaveLength(1);
    expect(status.transactions[0]).toMatchObject({
      id: "txn-1",
      provider: "paystack",
      providerReference: "ref_123",
      type: "credit_topup",
      amount: 1000,
      currency: "NGN",
      status: "completed",
      description: "Credit top-up for 1,000 credits",
      createdAt: "2026-06-22T10:00:00.000Z",
    });
  });
});
