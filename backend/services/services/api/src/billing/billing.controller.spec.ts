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

  function createController() {
    return new (BillingController as unknown as new (
      ...dependencies: unknown[]
    ) => BillingController)(
      legacyBilling,
      checkout,
      portal,
      null,
    ) as BillingController & {
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
});
