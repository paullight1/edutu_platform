import { BadRequestException } from "@nestjs/common";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  const originalEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    BILLING_PUBLIC_URL: process.env.BILLING_PUBLIC_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    ADMIN_URL: process.env.ADMIN_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalEnv.PAYSTACK_SECRET_KEY;
    process.env.BILLING_PUBLIC_URL = originalEnv.BILLING_PUBLIC_URL;
    process.env.FRONTEND_URL = originalEnv.FRONTEND_URL;
    process.env.ADMIN_URL = originalEnv.ADMIN_URL;
    process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      originalEnv.SUPABASE_SERVICE_ROLE_KEY;
    jest.restoreAllMocks();
  });

  function createSupabaseMock() {
    const profileResult = {
      data: {
        is_pro: true,
        pro_since: "2026-06-01T00:00:00.000Z",
        pro_expires_at: "2026-07-01T00:00:00.000Z",
        credits: 1000,
        credits_balance: 1200,
      },
      error: null,
    };

    const entitlementResult = {
      data: [
        {
          feature_key: "pro",
          expires_at: "2026-07-01T00:00:00.000Z",
          status: "active",
        },
      ],
      error: null,
    };

    const subscriptionResult = {
      data: {
        status: "active",
        current_period_end: "2026-07-01T00:00:00.000Z",
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

    const service = new BillingService();
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

  it("returns an unconfigured response when Paystack is missing", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const service = new BillingService();
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

    const service = new BillingService();
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
    const service = new BillingService();
    (service as any).supabase = createSupabaseMock();

    const status = await service.getStatus("user-1");

    expect(status).toMatchObject({
      isPro: true,
      proSince: "2026-06-01T00:00:00.000Z",
      proExpiresAt: "2026-07-01T00:00:00.000Z",
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
      description: "API credit top-up for 1,000 credits",
      createdAt: "2026-06-22T10:00:00.000Z",
    });
  });
});
