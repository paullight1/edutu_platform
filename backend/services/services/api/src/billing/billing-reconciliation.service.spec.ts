import { BillingReconciliationService } from "./billing-reconciliation.service";
import type {
  BillingReconciliationStore,
  ProviderReadAdapter,
  ReconciliationPage,
  ReconciliationPayment,
  ReconciliationRunResult,
} from "./reconciliation/reconciliation.types";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function payment(
  overrides: Partial<ReconciliationPayment> = {},
): ReconciliationPayment {
  return {
    id: "pay_1",
    eventId: "evt_pay_1",
    eventType: "collection.succeeded",
    status: "succeeded",
    userId: "user_123",
    productKey: "pro_monthly_pass",
    amountMinor: 1200n,
    currency: "USD",
    organizationId: "org_123",
    checkoutIntentId: "5cf2c495-f84f-46f1-aef4-f9c2b17cb1aa",
    occurredAt: "2026-08-11T11:55:00.000Z",
    metadata: { provider_reference: "checkout_1" },
    ...overrides,
  };
}

function page<T>(items: T[], nextCursor: string | null): ReconciliationPage<T> {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

function store(
  overrides: Partial<BillingReconciliationStore> = {},
): jest.Mocked<BillingReconciliationStore> {
  const base: BillingReconciliationStore = {
    listRecentIntents: jest.fn().mockResolvedValue([]),
    listRecentEvents: jest.fn().mockResolvedValue([]),
    listLocalPayments: jest.fn().mockResolvedValue([]),
    listLocalRefunds: jest.fn().mockResolvedValue([]),
    listLocalSubscriptions: jest.fn().mockResolvedValue([]),
    listLocalGrants: jest.fn().mockResolvedValue([]),
    hasResource: jest.fn().mockResolvedValue(false),
    createReviewCase: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return base;
}

function adapter(
  overrides: Partial<ProviderReadAdapter> = {},
): jest.Mocked<ProviderReadAdapter> {
  return {
    provider: "bachs",
    environment: "sandbox",
    listPayments: jest.fn().mockResolvedValue(page([], null)),
    listRefunds: jest.fn().mockResolvedValue(page([], null)),
    listSubscriptions: jest.fn().mockResolvedValue(page([], null)),
    ...overrides,
  };
}

function mockCalls<T extends object, K extends keyof T>(
  target: T,
  key: K,
): unknown[][] {
  const method = target[key];
  if (typeof method !== "function" || !("mock" in method)) {
    throw new Error(`Expected ${String(key)} to be a Jest mock`);
  }
  return (method as jest.Mock).mock.calls;
}

describe("BillingReconciliationService", () => {
  it("accepts a matching live payment instead of treating live as a mismatch", async () => {
    const live = adapter({
      environment: "live",
      listPayments: jest
        .fn()
        .mockResolvedValue(page([payment({ environment: "live" })], null)),
    });
    const reviewStore = store();
    const repair = jest.fn().mockResolvedValue({ status: "enqueued" });
    const service = new BillingReconciliationService({
      adapters: [live],
      store: reviewStore,
      repair,
      checkoutEnabled: true,
      expectedOrganizationId: "org_123",
      expectedAmountMinor: 1200n,
      expectedProductKey: "pro_monthly_pass",
    });

    await service.reconcileDaily({ now: NOW });

    expect(reviewStore.createReviewCase.mock.calls).toHaveLength(0);
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "bachs",
        environment: "live",
        providerResourceId: "pay_1",
      }),
    );
  });

  it("paginates cursor pages and repairs only a deterministic missing payment", async () => {
    const repair = jest.fn().mockResolvedValue({ status: "enqueued" });
    const bach = adapter({
      listPayments: jest
        .fn()
        .mockResolvedValueOnce(page([payment()], "cursor-2"))
        .mockResolvedValueOnce(
          page([payment({ id: "pay_2", eventId: "evt_pay_2" })], null),
        ),
    });
    const billingStore = store({
      hasResource: jest.fn().mockResolvedValue(false),
      createReviewCase: jest.fn().mockResolvedValue(undefined),
    });
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair,
      checkoutEnabled: false,
    });

    const result = await service.reconcileDaily({ now: NOW });

    expect(mockCalls(bach, "listPayments")[0]).toEqual([
      { cursor: undefined, signal: expect.any(AbortSignal) },
    ]);
    expect(mockCalls(bach, "listPayments")[1]).toEqual([
      { cursor: "cursor-2", signal: expect.any(AbortSignal) },
    ]);
    expect(repair).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "bachs",
        environment: "sandbox",
        providerResourceId: "pay_1",
        source: "reconciliation",
        provenance: expect.objectContaining({
          reason: "deterministic_missing_provider_event",
        }),
      }),
    );
    expect(result.repaired).toBe(2);
    expect(result.reviewCases).toBe(0);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "missing_provider_event",
          provider: "bachs",
          environment: "sandbox",
          count: 2,
        }),
      ]),
    );
  });

  it("does not loop when a cursor repeats and does not enqueue a duplicate repair", async () => {
    const repair = jest.fn().mockResolvedValue({ status: "duplicate" });
    const repeated = payment();
    const bach = adapter({
      listPayments: jest
        .fn()
        .mockResolvedValueOnce(page([repeated], "same-cursor"))
        .mockResolvedValueOnce(page([repeated], "same-cursor")),
    });
    const billingStore = store();
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair,
      checkoutEnabled: true,
      maxPages: 10,
    });

    const result = await service.reconcileDaily({ now: NOW });

    expect(mockCalls(bach, "listPayments")).toHaveLength(2);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.duplicates).toBe(1);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "duplicate_repair", count: 1 }),
      ]),
    );
  });

  it.each([
    ["amount_mismatch", { amountMinor: 1300n }],
    ["product_mismatch", { productKey: "credits_100" }],
    ["identity_mismatch", { userId: null }],
    ["organization_mismatch", { organizationId: "org_other" }],
    ["environment_mismatch", { environment: "live" as const }],
    [
      "refund_classification_ambiguous",
      { refundClassification: "unknown" as const },
    ],
  ] as const)(
    "creates a %s review case and never repairs ambiguous provider state",
    async (category, overrides) => {
      const repair = jest.fn();
      const billingStore = store();
      const bach = adapter({
        listPayments: jest
          .fn()
          .mockResolvedValue(page([payment(overrides)], null)),
      });
      const service = new BillingReconciliationService({
        adapters: [bach],
        store: billingStore,
        repair,
        checkoutEnabled: true,
        expectedOrganizationId: "org_123",
      });

      const result = await service.reconcileDaily({ now: NOW });

      expect(repair).not.toHaveBeenCalled();
      expect(mockCalls(billingStore, "createReviewCase")).toEqual(
        expect.arrayContaining([[expect.objectContaining({ category })]]),
      );
      expect(result.reviewCases).toBe(1);
    },
  );

  it("does not repair pending or wrong-currency credit payments", async () => {
    const repair = jest.fn();
    const billingStore = store();
    const bach = adapter({
      listPayments: jest
        .fn()
        .mockResolvedValue(
          page(
            [
              payment({ status: "pending" }),
              payment({ id: "pay_currency", currency: "NGN" }),
            ],
            null,
          ),
        ),
    });
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair,
      checkoutEnabled: true,
      expectedAmountMinor: 1200n,
      expectedCurrency: "USD",
      expectedProductKey: "pro_monthly_pass",
    });

    const result = await service.reconcileDaily({ now: NOW });

    expect(jest.mocked(repair)).not.toHaveBeenCalled();
    expect(result.reviewCases).toBe(2);
    expect(mockCalls(billingStore, "createReviewCase")).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ category: "payment_not_successful" })],
        [expect.objectContaining({ category: "currency_mismatch" })],
      ]),
    );
  });

  it("accepts an exact API credit catalog payment for reconciliation repair", async () => {
    const repair = jest.fn().mockResolvedValue({ status: "enqueued" });
    const billingStore = store();
    const bach = adapter({
      listPayments: jest.fn().mockResolvedValue(
        page(
          [
            payment({
              productKey: "api_credits_100",
              amountMinor: 499n,
              currency: "USD",
            }),
          ],
          null,
        ),
      ),
    });
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair,
      checkoutEnabled: true,
      expectedProducts: {
        api_credits_100: {
          amountMinor: 499n,
          currency: "USD",
          creditQuantity: 100,
        },
      },
    });

    await service.reconcileDaily({ now: NOW });

    expect(mockCalls(billingStore, "createReviewCase")).toHaveLength(0);
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResourceId: "pay_1",
        productKey: "api_credits_100",
        amountMinor: 499n,
        currency: "USD",
        userId: "user_123",
      }),
    );
  });

  it("retries one timeout at the read boundary, then records provider outage without guessing", async () => {
    const timeout = Object.assign(new Error("provider timed out"), {
      code: "timeout",
      retryable: true,
    });
    const bach = adapter({
      listPayments: jest
        .fn()
        .mockRejectedValueOnce(timeout)
        .mockRejectedValueOnce(timeout),
    });
    const repair = jest.fn();
    const billingStore = store();
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair,
      checkoutEnabled: false,
      maxReadAttempts: 2,
    });

    const result = await service.reconcileDaily({ now: NOW });

    expect(mockCalls(bach, "listPayments")).toHaveLength(2);
    expect(repair).not.toHaveBeenCalled();
    expect(mockCalls(billingStore, "createReviewCase")).toHaveLength(0);
    expect(result.providerErrors).toBe(1);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "provider_outage", count: 1 }),
      ]),
    );
  });

  it("checks recent open, pending, and failed local state even when checkout is disabled", async () => {
    const billingStore = store({
      listRecentIntents: jest.fn().mockResolvedValue([
        { id: "intent_1", status: "open" },
        { id: "intent_2", status: "pending" },
        { id: "intent_3", status: "failed" },
      ]),
      listRecentEvents: jest
        .fn()
        .mockResolvedValue([{ id: "event_1", status: "received" }]),
    });
    const bach = adapter();
    const service = new BillingReconciliationService({
      adapters: [bach],
      store: billingStore,
      repair: jest.fn(),
      checkoutEnabled: false,
    });

    const result = await service.reconcileRecent({ now: NOW });

    expect(mockCalls(billingStore, "listRecentIntents")).toEqual([
      [
        {
          since: new Date("2026-08-11T11:45:00.000Z"),
          until: NOW,
          statuses: ["open", "pending", "failed"],
        },
      ],
    ]);
    expect(mockCalls(billingStore, "listRecentEvents")).toEqual([
      [
        {
          since: new Date("2026-08-11T11:45:00.000Z"),
          until: NOW,
          statuses: ["received", "retrying", "dead_letter"],
        },
      ],
    ]);
    expect(result.checkoutEnabled).toBe(false);
    expect(mockCalls(bach, "listPayments").length).toBeGreaterThan(0);
  });

  it("keeps Bachs and RevenueCat grants provider-scoped during comparison", async () => {
    const billingStore = store({
      listLocalGrants: jest.fn().mockResolvedValue([
        {
          provider: "revenuecat",
          environment: "live",
          sourceResourceId: "rc_entitlement_1",
          userId: "user_123",
          status: "active",
        },
      ]),
    });
    const bach = adapter({ provider: "bachs", environment: "sandbox" });
    const revenueCat = adapter({
      provider: "revenuecat",
      environment: "live",
      listEntitlements: jest.fn().mockResolvedValue(page([], null)),
    });
    const service = new BillingReconciliationService({
      adapters: [bach, revenueCat],
      store: billingStore,
      repair: jest.fn(),
      checkoutEnabled: true,
    });

    await service.reconcileDaily({ now: NOW });

    expect(mockCalls(billingStore, "listLocalGrants")).toEqual(
      expect.arrayContaining([
        [{ provider: "bachs", environment: "sandbox" }],
        [{ provider: "revenuecat", environment: "live" }],
      ]),
    );
    expect(mockCalls(billingStore, "createReviewCase")).not.toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ sourceResourceId: "rc_entitlement_1" })],
      ]),
    );
  });

  it("emits redacted structured metrics and never exposes raw payload, email, URL, or token", async () => {
    const secretEmail = "student@example.com";
    const secretUrl = "https://checkout.bachs.io/session_secret";
    const secretToken = "bearer-secret-token";
    const bach = adapter({
      listPayments: jest.fn().mockResolvedValue(
        page(
          [
            payment({
              metadata: {
                email: secretEmail,
                checkoutUrl: secretUrl,
                token: secretToken,
                rawPayload: { secret: secretToken },
              },
            }),
          ],
          null,
        ),
      ),
    });
    const result = await new BillingReconciliationService({
      adapters: [bach],
      store: store(),
      repair: jest.fn().mockResolvedValue({ status: "enqueued" }),
      checkoutEnabled: true,
    }).reconcileDaily({ now: NOW });

    const serialized = JSON.stringify(result.metrics);
    expect(serialized).not.toContain(secretEmail);
    expect(serialized).not.toContain(secretUrl);
    expect(serialized).not.toContain(secretToken);
    expect(result.metrics[0]).toEqual(
      expect.objectContaining({ provider: "bachs", environment: "sandbox" }),
    );
  });
});

// Keep this import in the test so a future service cannot silently change the
// public result into an untyped object without a compile-time review.
const _resultTypeCheck: ReconciliationRunResult | undefined = undefined;
void _resultTypeCheck;
