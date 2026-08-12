import { BachsClient, BachsProviderError } from "./bachs.client";
import { BachsConfigError, loadBachsConfig } from "./bachs.config";

const validEnvironment = {
  BACHS_CHECKOUT_ENABLED: "true",
  BACHS_ENVIRONMENT: "sandbox",
  BACHS_API_BASE_URL: "https://sandbox-api.bachs.io",
  BACHS_API_KEY: "test-api-key",
  BACHS_WEBHOOK_SECRET: "test-webhook-secret",
  BACHS_EXPECTED_ORGANIZATION_ID: "org_test",
  BACHS_PRODUCT_MAPPINGS: JSON.stringify({
    pro_monthly_card: "prod_monthly",
  }),
};

const checkoutResponse = {
  checkout_id: "chk_123",
  checkout_url: "https://checkout.bachs.io/c/tok_123",
  status: "open",
  expires_at: "2026-08-12T12:00:00.000Z",
  created_at: "2026-08-11T12:00:00.000Z",
  reference: "intent_123",
};

describe("BachsClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createClient() {
    return new BachsClient(loadBachsConfig(validEnvironment));
  }

  it("keeps Bachs disabled by default and rejects incomplete enabled configuration", () => {
    expect(loadBachsConfig({}).checkoutEnabled).toBe(false);

    expect(() =>
      loadBachsConfig({
        BACHS_CHECKOUT_ENABLED: "true",
        BACHS_ENVIRONMENT: "sandbox",
      }),
    ).toThrow(BachsConfigError);
  });

  it("allows the application to boot with Bachs disabled and makes no provider request", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const client = new BachsClient(loadBachsConfig({}));

    await expect(client.getPayment("chrg_123")).rejects.toMatchObject({
      code: "bachs_disabled",
      operation: "get_payment",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a catalog checkout with an idempotency key and no client money amount", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(checkoutResponse), { status: 201 }),
      );

    const checkout = await createClient().createCheckoutSession({
      productId: "prod_monthly",
      customer: { email: "buyer@example.test", name: "Buyer Example" },
      billingCurrency: "USD",
      successUrl: "https://pay.edutu.org/result",
      cancelUrl: "https://pay.edutu.org/result?state=cancelled",
      reference: "intent_123",
      metadata: { intent_id: "intent_123" },
      idempotencyKey: "checkout_intent_123",
    });

    expect(checkout.checkoutId).toBe("chk_123");
    expect(checkout.checkoutUrl).toBe("https://checkout.bachs.io/c/tok_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.bachs.io/v1/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "Idempotency-Key": "checkout_intent_123",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      customer: { email: "buyer@example.test", name: "Buyer Example" },
      product_cart: [{ product_id: "prod_monthly", quantity: 1 }],
      billing_currency: "USD",
      success_url: "https://pay.edutu.org/result",
      cancel_url: "https://pay.edutu.org/result?state=cancelled",
      reference: "intent_123",
      metadata: { intent_id: "intent_123" },
    });
  });

  it("rejects a malformed checkout response before returning an untrusted URL", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...checkoutResponse,
          checkout_url: "https://evil.test",
        }),
        { status: 201 },
      ),
    );

    await expect(
      createClient().createCheckoutSession({
        productId: "prod_monthly",
        customer: { email: "buyer@example.test" },
        successUrl: "https://pay.edutu.org/result",
        cancelUrl: "https://pay.edutu.org/result?state=cancelled",
        idempotencyKey: "checkout_intent_124",
      }),
    ).rejects.toMatchObject({
      code: "invalid_provider_response",
      operation: "create_checkout_session",
    });
  });

  it("retries a retryable POST exactly once with the same idempotency key", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(checkoutResponse), { status: 201 }),
      );

    await createClient().createCheckoutSession({
      productId: "prod_monthly",
      customer: { email: "buyer@example.test" },
      successUrl: "https://pay.edutu.org/result",
      cancelUrl: "https://pay.edutu.org/result?state=cancelled",
      idempotencyKey: "checkout_intent_125",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({ "Idempotency-Key": "checkout_intent_125" }),
      );
    }
  });

  it("does not retry HTTP 408 because only network failures, 429, and 5xx are retryable", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 408 }));

    await expect(
      createClient().createCheckoutSession({
        productId: "prod_monthly",
        customer: { email: "buyer@example.test" },
        successUrl: "https://pay.edutu.org/result",
        cancelUrl: "https://pay.edutu.org/result?state=cancelled",
        idempotencyKey: "checkout_intent_408",
      }),
    ).rejects.toMatchObject({
      code: "provider_http_error",
      status: 408,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-retryable provider response or expose its body", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: "buyer@example.test test-api-key" }),
          { status: 400 },
        ),
      );

    const error = await createClient()
      .createCustomer({
        email: "buyer@example.test",
        idempotencyKey: "customer_123",
      })
      .catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(BachsProviderError);
    expect(error).toMatchObject({
      code: "provider_http_error",
      status: 400,
      retryable: false,
      operation: "create_customer",
    });
    expect(String(error)).not.toContain("buyer@example.test");
    expect(String(error)).not.toContain("test-api-key");
  });

  it("creates portal sessions only when Bachs returns a portal origin URL", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "psn_123",
          url: "https://portal.bachs.io/s/token_123",
        }),
        { status: 201 },
      ),
    );

    await expect(
      createClient().createPortalSession({
        customerId: "cust_123",
        idempotencyKey: "portal_123",
      }),
    ).resolves.toEqual({
      id: "psn_123",
      url: "https://portal.bachs.io/s/token_123",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.bachs.io/v1/customers/cust_123/portal-sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "portal_123" }),
      }),
    );
  });

  it("offers validated retrieval and pagination primitives for reconciliation", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(checkoutResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "chrg_123",
                reference: "intent_123",
                status: "succeeded",
                is_refundable: true,
                amount: "10.00",
                amount_paid: "10.00",
                amount_remaining: "0.00",
                settlement_amount: "9.00",
                currency: "USD",
                created_at: "2026-08-11T12:00:00.000Z",
                updated_at: "2026-08-11T12:00:00.000Z",
              },
            ],
            pagination: {
              next_cursor: null,
              prev_cursor: null,
              has_more: false,
              limit: 20,
              offset: 0,
            },
          }),
          { status: 200 },
        ),
      );

    const client = createClient();
    await expect(client.getCheckoutSession("chk_123")).resolves.toMatchObject({
      checkoutId: "chk_123",
    });
    await expect(client.listPayments({ limit: 20 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          amount: "10.00",
          settlementAmount: "9.00",
        }),
      ],
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://sandbox-api.bachs.io/v1/checkout-sessions/chk_123",
      "https://sandbox-api.bachs.io/v1/payments?limit=20",
    ]);
  });
});
