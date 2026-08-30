import type { RevenueCatSubscriberSnapshot } from "./providers/revenuecat/revenuecat.client";
import {
  RevenueCatReconciliationAdapter,
  type RevenueCatLocalSubscriptionState,
  type RevenueCatReconciliationPersistence,
} from "./billing-reconciliation.providers";

function snapshot(
  activeEntitlements: RevenueCatSubscriberSnapshot["activeEntitlements"],
): RevenueCatSubscriberSnapshot {
  return { appUserId: "user_clerk_one", activeEntitlements };
}

function local(
  overrides: Partial<RevenueCatLocalSubscriptionState> = {},
): RevenueCatLocalSubscriptionState {
  return {
    appUserId: "user_clerk_one",
    environment: "live",
    lineageId: "lineage-one",
    entitlementKey: "pro",
    productKey: "pro_monthly",
    providerProductId: "edutu_pro_monthly_v1",
    status: "active",
    currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
    hasActiveGrant: true,
    scheduledProductKey: null,
    scheduledProviderProductId: null,
    scheduledChangeAt: null,
    ...overrides,
  };
}

function harness(options: {
  snapshot?: RevenueCatSubscriberSnapshot;
  local?: RevenueCatLocalSubscriptionState[];
}) {
  const getSubscriberMock = jest
    .fn()
    .mockResolvedValue(options.snapshot ?? snapshot([]));
  const client = {
    getSubscriber: getSubscriberMock,
  };
  const repairMissingGrantMock = jest.fn().mockResolvedValue(true);
  const createReviewCaseMock = jest.fn().mockResolvedValue(undefined);
  const persistence: jest.Mocked<RevenueCatReconciliationPersistence> = {
    listSubjects: jest.fn().mockResolvedValue(["user_clerk_one"]),
    readLocalState: jest.fn().mockResolvedValue(options.local ?? []),
    repairMissingGrant: repairMissingGrantMock,
    createReviewCase: createReviewCaseMock,
  };
  return {
    createReviewCaseMock,
    getSubscriberMock,
    repairMissingGrantMock,
    adapter: new RevenueCatReconciliationAdapter(client as never, persistence),
  };
}

describe("RevenueCatReconciliationAdapter", () => {
  it("repairs only a missing RevenueCat source grant proven active upstream", async () => {
    const state = local({ hasActiveGrant: false });
    const {
      adapter,
      createReviewCaseMock,
      getSubscriberMock,
      repairMissingGrantMock,
    } = harness({
      local: [state],
      snapshot: snapshot([
        {
          id: "pro",
          productId: "edutu_pro_monthly_v1",
          expiresAt: new Date("2026-09-01T00:00:00Z"),
        },
      ]),
    });

    await expect(adapter.reconcile("live")).resolves.toEqual({
      checked: 1,
      repaired: 1,
      reviewCases: 0,
    });
    expect(repairMissingGrantMock).toHaveBeenCalledWith(state);
    expect(createReviewCaseMock).not.toHaveBeenCalled();
    expect(getSubscriberMock).toHaveBeenCalledWith("user_clerk_one", "live");
  });

  it.each([
    [
      "paid_without_grant",
      snapshot([
        {
          id: "pro",
          productId: "edutu_pro_monthly_v1",
          expiresAt: new Date("2026-09-01T00:00:00Z"),
        },
      ]),
      [],
    ],
    ["grant_without_provider_access", snapshot([]), [local()]],
    [
      "product_mismatch",
      snapshot([
        {
          id: "pro",
          productId: "edutu_pro_yearly_v1",
          expiresAt: new Date("2027-08-30T00:00:00Z"),
        },
      ]),
      [local()],
    ],
    [
      "stale_scheduled_change",
      snapshot([
        {
          id: "scholar",
          productId: "edutu_scholar_monthly_v1",
          expiresAt: new Date("2026-09-30T00:00:00Z"),
        },
      ]),
      [
        local({
          hasActiveGrant: false,
          scheduledProductKey: "scholar_monthly",
          scheduledProviderProductId: "edutu_scholar_monthly_v1",
          scheduledChangeAt: new Date("2026-08-29T00:00:00Z"),
        }),
      ],
    ],
  ] as const)(
    "creates a %s review case and does not make an ambiguous repair",
    async (category, providerSnapshot, localState) => {
      const { adapter, createReviewCaseMock, repairMissingGrantMock } = harness(
        {
          snapshot: providerSnapshot,
          local: [...localState],
        },
      );

      const result = await adapter.reconcile("live", {
        now: new Date("2026-08-30T00:00:00Z"),
      });

      expect(result.reviewCases).toBeGreaterThan(0);
      expect(createReviewCaseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "revenuecat",
          environment: "live",
          category,
          providerResourceId: expect.any(String),
        }),
      );
      expect(repairMissingGrantMock).not.toHaveBeenCalled();
    },
  );

  it("keeps sandbox reconciliation from creating an effective live grant", async () => {
    const state = local({ environment: "sandbox", hasActiveGrant: false });
    const { adapter, repairMissingGrantMock } = harness({
      local: [state],
      snapshot: snapshot([
        {
          id: "pro",
          productId: "edutu_pro_monthly_v1",
          expiresAt: new Date("2026-09-01T00:00:00Z"),
        },
      ]),
    });

    await adapter.reconcile("sandbox");

    expect(repairMissingGrantMock).not.toHaveBeenCalled();
  });
});
