import { BillingController } from "./billing.controller";

describe("BillingController Bachs routes", () => {
  const checkout = {
    createCheckout: jest.fn(),
  };
  const portal = {
    createPortalSession: jest.fn(),
  };
  const legacyBilling = {
    getStatus: jest.fn(),
    createCheckout: jest.fn(),
    getAdminOverview: jest.fn(),
    listAdminTransactions: jest.fn(),
    handlePaystackWebhook: jest.fn(),
    handleBachsWebhook: jest.fn(),
  };
  const sandboxRevenueCat = { handle: jest.fn() };
  const productionRevenueCat = { handle: jest.fn() };

  function createController() {
    return new (BillingController as unknown as new (
      ...dependencies: unknown[]
    ) => BillingController)(legacyBilling, checkout, portal, null, {
      sandbox: sandboxRevenueCat,
      production: productionRevenueCat,
    }) as BillingController & {
      createBachsCheckout: (
        rawAuthSubject: string,
        email: string | undefined,
        firstName: string | undefined,
        lastName: string | undefined,
        idempotencyKey: string | undefined,
        body: { productKey: string; returnSurface: "web" },
      ) => Promise<{
        checkoutUrl: string;
        intentId: string;
        expiresAt: string;
      }>;
      createBachsPortalSession: (
        rawAuthSubject: string,
      ) => Promise<{ url: string }>;
      handleRevenueCatWebhook: (
        environment: string,
        authorization: string | undefined,
        signature: string | undefined,
        request: { rawBody?: Buffer; body?: unknown },
      ) => Promise<{ accepted: true; eventId: string; duplicate: boolean }>;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns only the public Bachs checkout fields for the authenticated raw subject", async () => {
    checkout.createCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.bachs.io/s/session-1",
      intentId: "intent-1",
      expiresAt: "2026-08-11T11:00:00.000Z",
      status: "open",
      renewalMode: "one_time",
      productSnapshot: { productKey: "pro_monthly_pass" },
    });

    await expect(
      createController().createBachsCheckout(
        "user_123",
        "student@example.com",
        "Student",
        undefined,
        "idem-1",
        { productKey: "pro_monthly_pass", returnSurface: "web" },
      ),
    ).resolves.toEqual({
      checkoutUrl: "https://checkout.bachs.io/s/session-1",
      intentId: "intent-1",
      expiresAt: "2026-08-11T11:00:00.000Z",
    });
    expect(checkout.createCheckout).toHaveBeenCalledWith(
      "user_123",
      "idem-1",
      { productKey: "pro_monthly_pass", returnSurface: "web" },
      { status: "resolved", email: "student@example.com", name: "Student" },
    );
  });

  it("creates a fresh authenticated Bachs portal session", async () => {
    portal.createPortalSession.mockResolvedValue({
      url: "https://portal.bachs.io/s/portal-1",
    });

    await expect(
      createController().createBachsPortalSession("user_123"),
    ).resolves.toEqual({
      url: "https://portal.bachs.io/s/portal-1",
    });
    expect(portal.createPortalSession).toHaveBeenCalledWith(
      "user_123",
      expect.any(String),
    );
  });

  it("forwards exact RevenueCat raw bytes to the selected environment service", async () => {
    const rawBody = Buffer.from('{"api_version":"1.0"}');
    productionRevenueCat.handle.mockResolvedValue({
      accepted: true,
      eventId: "event-one",
      duplicate: false,
    });

    await expect(
      createController().handleRevenueCatWebhook(
        "production",
        "authorization-value",
        "t=1,v1=signature",
        { rawBody, body: { api_version: "1.0" } },
      ),
    ).resolves.toEqual({
      accepted: true,
      eventId: "event-one",
      duplicate: false,
    });
    expect(productionRevenueCat.handle).toHaveBeenCalledWith(
      rawBody,
      "authorization-value",
      "t=1,v1=signature",
    );
  });

  it("rejects missing raw body and an unknown delivery environment", async () => {
    await expect(
      createController().handleRevenueCatWebhook(
        "sandbox",
        "authorization-value",
        "signature",
        { body: {} },
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      createController().handleRevenueCatWebhook(
        "staging",
        "authorization-value",
        "signature",
        { rawBody: Buffer.from("{}") },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(sandboxRevenueCat.handle).not.toHaveBeenCalled();
  });
});
