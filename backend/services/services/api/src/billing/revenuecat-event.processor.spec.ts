import { Logger } from "@nestjs/common";
import type { BillingEventRecord } from "./billing-events.repository";
import {
  RevenueCatEventProcessor,
  type RevenueCatIdentityResolver,
  type RevenueCatLifecycleApplier,
} from "./revenuecat-event.processor";

const SUPPORTED_EVENT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "UNCANCELLATION",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
  "BILLING_ISSUE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "REFUND_REVERSED",
  "TRANSFER",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "PURCHASE_REDEEMED",
  "REFUND",
  "PRICE_INCREASE_CONSENT_REQUIRED",
  "PRICE_INCREASE_CONSENT_APPROVED",
] as const;

function inboxEvent(
  type: string,
  eventOverrides: Record<string, unknown> = {},
): BillingEventRecord {
  const providerEvent = {
    type,
    id: `event-${type.toLowerCase()}`,
    event_timestamp_ms: Date.parse("2026-08-30T10:00:00.000Z"),
    app_user_id: "user_clerk_one",
    original_app_user_id: "user_clerk_one",
    product_id: "edutu_pro_monthly_v1",
    expiration_at_ms: Date.parse("2026-09-30T10:00:00.000Z"),
    original_transaction_id: "lineage-one",
    transaction_id: "transaction-one",
    store: "APP_STORE",
    environment: "PRODUCTION",
    ...eventOverrides,
  };
  return {
    id: `11111111-1111-4111-8111-${String(type.length).padStart(12, "0")}`,
    provider: "revenuecat",
    environment: "live",
    eventId: String(providerEvent.id),
    eventType: type,
    providerReference: String(providerEvent.transaction_id ?? providerEvent.id),
    organizationId: null,
    providerAccountId: "app-ios-production",
    payload: {
      api_version: "1.0",
      event: providerEvent,
      deliveryEnvironment: "PRODUCTION",
      identityCandidates: ["user_clerk_one"],
      resourceKey: providerEvent.transaction_id,
      subscriptionLineageKey: providerEvent.original_transaction_id,
      paidPeriodKey: providerEvent.transaction_id,
    },
    payloadHash: "hash",
    status: "processing",
    attemptCount: 1,
    nextRetryAt: null,
    lastError: null,
    receivedAt: new Date("2026-08-30T10:00:01.000Z"),
    processedAt: null,
    updatedAt: new Date("2026-08-30T10:00:01.000Z"),
  };
}

function harness(
  options: {
    events?: BillingEventRecord[];
    outcome?: "applied" | "duplicate" | "stale" | "review";
    applyError?: Error;
    identityError?: Error;
    resolvedIdentity?: string | null;
  } = {},
) {
  const events = {
    lease: jest.fn().mockResolvedValue(options.events ?? []),
    complete: jest.fn().mockResolvedValue(true),
    retry: jest.fn().mockResolvedValue({ status: "failed" }),
    review: jest.fn().mockResolvedValue(true),
  };
  const identityResolver: RevenueCatIdentityResolver = {
    resolve: options.identityError
      ? jest.fn().mockRejectedValue(options.identityError)
      : jest
          .fn()
          .mockResolvedValue(
            options.resolvedIdentity === undefined
              ? "user_clerk_one"
              : options.resolvedIdentity,
          ),
  };
  const applier: RevenueCatLifecycleApplier = {
    apply: options.applyError
      ? jest.fn().mockRejectedValue(options.applyError)
      : jest.fn().mockResolvedValue({
          outcome: options.outcome ?? "applied",
          userId: "user_clerk_one",
          tier: "pro",
        }),
  };
  return {
    applier,
    events,
    identityResolver,
    processor: new RevenueCatEventProcessor(
      events as never,
      identityResolver,
      applier,
    ),
  };
}

describe("RevenueCatEventProcessor", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it.each(SUPPORTED_EVENT_TYPES)(
    "normalizes and applies %s without blocking webhook delivery",
    async (eventType) => {
      const event = inboxEvent(
        eventType,
        eventType === "TRANSFER"
          ? {
              transferred_from: ["user_clerk_old"],
              transferred_to: ["user_clerk_one"],
            }
          : {},
      );
      const { applier, events, processor } = harness({ events: [event] });

      await expect(processor.processBatch()).resolves.toEqual({
        processed: 1,
        retried: 0,
        reviewed: 0,
      });
      expect(applier.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "live",
          eventId: event.eventId,
          eventType,
          appUserId: "user_clerk_one",
          productId: "edutu_pro_monthly_v1",
          subscriptionLineageId: "lineage-one",
          transactionId: "transaction-one",
          occurredAt: new Date("2026-08-30T10:00:00.000Z"),
          expiresAt: new Date("2026-09-30T10:00:00.000Z"),
        }),
      );
      expect(events.complete).toHaveBeenCalledWith(event.id);
      expect(events.lease).toHaveBeenCalledWith(100, {
        provider: "revenuecat",
      });
    },
  );

  it("tolerates unknown additive fields on a known event", async () => {
    const event = inboxEvent("RENEWAL", {
      future_provider_field: { nested: ["safe", 123] },
    });
    const { applier, processor } = harness({ events: [event] });

    await expect(processor.processBatch()).resolves.toMatchObject({
      processed: 1,
    });
    expect(applier.apply).toHaveBeenCalledWith(
      expect.objectContaining({ payload: event.payload }),
    );
  });

  it("moves anonymous, unresolved, malformed, and unknown events to review", async () => {
    const anonymous = inboxEvent("RENEWAL", {
      app_user_id: "$RCAnonymousID:secret",
      original_app_user_id: "$RCAnonymousID:secret",
    });
    anonymous.payload = {
      ...(anonymous.payload as object),
      identityCandidates: ["$RCAnonymousID:secret"],
    };
    const malformed = inboxEvent("RENEWAL", { event_timestamp_ms: "bad" });
    const unknown = inboxEvent("A_FUTURE_EVENT");
    const { applier, events, processor } = harness({
      events: [anonymous, malformed, unknown],
      resolvedIdentity: null,
    });

    await expect(processor.processBatch()).resolves.toEqual({
      processed: 0,
      retried: 0,
      reviewed: 3,
    });
    expect(applier.apply).not.toHaveBeenCalled();
    expect(events.review).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(events.review.mock.calls)).not.toContain(
      "$RCAnonymousID:secret",
    );
  });

  it("moves permanent product mismatches returned by the SQL authority to review", async () => {
    const event = inboxEvent("INITIAL_PURCHASE");
    const { events, processor } = harness({
      events: [event],
      outcome: "review",
    });

    await expect(processor.processBatch()).resolves.toEqual({
      processed: 0,
      retried: 0,
      reviewed: 1,
    });
    expect(events.review).toHaveBeenCalledWith(
      event.id,
      "revenuecat_lifecycle_review",
    );
  });

  it("retries transient authority failures and logs no payload or provider error", async () => {
    const event = inboxEvent("RENEWAL", {
      metadata: { private_value: "must-not-log" },
    });
    const { events, processor } = harness({
      events: [event],
      applyError: new Error("database URL password=must-not-log"),
    });

    await expect(processor.processBatch()).resolves.toEqual({
      processed: 0,
      retried: 1,
      reviewed: 0,
    });
    expect(events.retry).toHaveBeenCalledWith(
      event.id,
      "revenuecat_lifecycle_apply_failed",
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("must-not-log");
  });

  it("retries transient identity-store failures instead of abandoning the lease", async () => {
    const event = inboxEvent("RENEWAL");
    const { events, processor } = harness({
      events: [event],
      identityError: new Error("connection unavailable"),
    });

    await expect(processor.processBatch()).resolves.toEqual({
      processed: 0,
      retried: 1,
      reviewed: 0,
    });
    expect(events.retry).toHaveBeenCalledWith(
      event.id,
      "revenuecat_lifecycle_apply_failed",
    );
  });

  it("treats a verified RevenueCat TEST event as a processed no-op", async () => {
    const event = inboxEvent("TEST", {
      product_id: null,
      original_transaction_id: null,
      transaction_id: null,
    });
    const { applier, events, processor } = harness({ events: [event] });

    await expect(processor.processBatch()).resolves.toEqual({
      processed: 1,
      retried: 0,
      reviewed: 0,
    });
    expect(applier.apply).not.toHaveBeenCalled();
    expect(events.complete).toHaveBeenCalledWith(event.id);
  });
});
