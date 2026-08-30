import { createHmac } from "node:crypto";
import { HttpException, Logger } from "@nestjs/common";
import {
  BillingEventsRepository,
  type BillingEventRecord,
  type BillingEventsPersistence,
} from "./billing-events.repository";
import { RevenueCatWebhookService } from "./revenuecat-webhook.service";

class MemoryPersistence implements BillingEventsPersistence {
  readonly records = new Map<string, BillingEventRecord>();

  async insert(input: Parameters<BillingEventsPersistence["insert"]>[0]) {
    const key = `${input.provider}:${input.environment}:${input.eventId}`;
    const existing = this.records.get(key);
    if (existing) {
      if (existing.payloadHash !== input.payloadHash) {
        existing.status = "review";
        existing.lastError = "provider_event_payload_conflict";
        return { kind: "conflict" as const, event: existing };
      }
      return { kind: "duplicate" as const, event: existing };
    }
    const event: BillingEventRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      provider: input.provider,
      environment: input.environment,
      eventId: input.eventId,
      eventType: input.eventType,
      providerReference: input.providerReference ?? null,
      organizationId: input.organizationId ?? null,
      providerAccountId: input.providerAccountId ?? null,
      payloadHash: input.payloadHash,
      payload: input.payload,
      status: "received",
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      receivedAt: input.receivedAt,
      processedAt: null,
      updatedAt: input.receivedAt,
    };
    this.records.set(key, event);
    return { kind: "inserted" as const, event };
  }

  async leaseBatch() {
    return [];
  }
  async complete() {
    return false;
  }
  async retry() {
    return null;
  }
  async review() {
    return false;
  }
}

describe("RevenueCatWebhookService", () => {
  const nowSeconds = 1_788_090_000;
  const authorizationSecret = "authorization-secret-123456789012";
  const hmacSecret = "hmac-signing-secret-1234567890123";
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(() => {
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function envelope(overrides: Record<string, unknown> = {}) {
    return {
      api_version: "1.0",
      event: {
        type: "INITIAL_PURCHASE",
        id: "event-one",
        event_timestamp_ms: nowSeconds * 1_000,
        app_id: "app-ios-production",
        app_user_id: "user-clerk-one",
        original_app_user_id: "user-clerk-one",
        product_id: "edutu_pro_monthly_v1",
        environment: "PRODUCTION",
        transaction_id: "transaction-one",
        original_transaction_id: "lineage-one",
        store: "APP_STORE",
        subscriber_attributes: {
          $email: { value: "private@example.com" },
        },
        ...overrides,
      },
    };
  }

  function signed(payload: unknown) {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac("sha256", hmacSecret)
      .update(String(nowSeconds))
      .update(".")
      .update(rawBody)
      .digest("hex");
    return {
      rawBody,
      authorization: authorizationSecret,
      signature: `t=${nowSeconds},v1=${signature}`,
    };
  }

  function harness() {
    const persistence = new MemoryPersistence();
    const repository = new BillingEventsRepository(persistence, {
      clock: () => new Date(nowSeconds * 1_000),
    });
    const service = new RevenueCatWebhookService(
      {
        enabled: true,
        environment: "production",
        expectedEnvironment: "PRODUCTION",
        authorizationSecret,
        hmacSecret,
        allowedAppIds: ["app-ios-production", "app-android-production"],
        allowedStores: ["APP_STORE", "PLAY_STORE"],
      },
      repository,
      { clock: () => nowSeconds * 1_000 },
    );
    return { persistence, service };
  }

  it("durably accepts a verified event before acknowledging it", async () => {
    const { persistence, service } = harness();
    const input = signed(envelope());

    await expect(
      service.handle(input.rawBody, input.authorization, input.signature),
    ).resolves.toEqual({
      accepted: true,
      eventId: "event-one",
      duplicate: false,
    });
    const stored = [...persistence.records.values()][0];
    expect(stored.providerReference).toBe("transaction-one");
    expect(stored.providerAccountId).toBe("app-ios-production");
    expect(JSON.stringify(stored.payload)).not.toContain("private@example.com");
  });

  it("acknowledges an exact duplicate without a second event", async () => {
    const { persistence, service } = harness();
    const input = signed(envelope());

    await service.handle(input.rawBody, input.authorization, input.signature);
    await expect(
      service.handle(input.rawBody, input.authorization, input.signature),
    ).resolves.toEqual({
      accepted: true,
      eventId: "event-one",
      duplicate: true,
    });
    expect(persistence.records.size).toBe(1);
  });

  it("moves a reused event ID with different bytes to review", async () => {
    const { persistence, service } = harness();
    const first = signed(envelope());
    const changed = signed(
      envelope({ product_id: "edutu_scholar_monthly_v1" }),
    );
    await service.handle(first.rawBody, first.authorization, first.signature);

    await expect(
      service.handle(changed.rawBody, changed.authorization, changed.signature),
    ).rejects.toMatchObject({ status: 409 });
    expect([...persistence.records.values()][0]?.status).toBe("review");
  });

  it.each([
    ["bad authorization", { authorization: "wrong" }],
    ["bad signature", { signature: `t=${nowSeconds},v1=${"0".repeat(64)}` }],
  ])("rejects %s without storing an event", async (_label, changes) => {
    const { persistence, service } = harness();
    const input = { ...signed(envelope()), ...changes };

    await expect(
      service.handle(input.rawBody, input.authorization, input.signature),
    ).rejects.toBeInstanceOf(HttpException);
    expect(persistence.records.size).toBe(0);
  });

  it.each([
    ["wrong app", { app_id: "other-app" }],
    ["wrong store", { store: "STRIPE" }],
    ["wrong environment", { environment: "SANDBOX" }],
  ])("rejects %s before durable insertion", async (_label, eventChanges) => {
    const { persistence, service } = harness();
    const input = signed(envelope(eventChanges));

    await expect(
      service.handle(input.rawBody, input.authorization, input.signature),
    ).rejects.toMatchObject({ status: 400 });
    expect(persistence.records.size).toBe(0);
  });
});
