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

function store(overrides: Partial<BillingReconciliationStore> = {}) {
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
): ProviderReadAdapter {
  return {
    provider: "bachs",
    environment: "sandbox",
    listPayments: jest.fn().mockResolvedValue(page([], null)),
    listRefunds: jest.fn().mockResolvedValue(page([], null)),
    listSubscriptions: jest.fn().mockResolvedValue(page([], null)),
    ...overrides,
  };
}

describe("BillingReconciliationService", () => {
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

    expect(bach.listPayments).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(bach.listPayments).toHaveBeenNthCalledWith(2, {
      cursor: "cursor-2",
      signal: expect.any(AbortSignal),
    });
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

    expect(bach.listPayments).toHaveBeenCalledTimes(2);
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
      expect(billingStore.createReviewCase).toHaveBeenCalledWith(
        expect.objectContaining({ category }),
      );
      expect(result.reviewCases).toBe(1);
    },
  );

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

    expect(bach.listPayments).toHaveBeenCalledTimes(2);
    expect(repair).not.toHaveBeenCalled();
    expect(billingStore.createReviewCase).not.toHaveBeenCalled();
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

    expect(billingStore.listRecentIntents).toHaveBeenCalledWith({
      since: new Date("2026-08-11T11:45:00.000Z"),
      until: NOW,
      statuses: ["open", "pending", "failed"],
    });
    expect(billingStore.listRecentEvents).toHaveBeenCalledWith({
      since: new Date("2026-08-11T11:45:00.000Z"),
      until: NOW,
      statuses: ["received", "retrying", "dead_letter"],
    });
    expect(result.checkoutEnabled).toBe(false);
    expect(bach.listPayments).toHaveBeenCalled();
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

    expect(billingStore.listLocalGrants).toHaveBeenCalledWith({
      provider: "bachs",
      environment: "sandbox",
    });
    expect(billingStore.listLocalGrants).toHaveBeenCalledWith({
      provider: "revenuecat",
      environment: "live",
    });
    expect(billingStore.createReviewCase).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceResourceId: "rc_entitlement_1" }),
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
