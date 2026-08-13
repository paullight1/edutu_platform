import {
  BillingEventsRepository,
  type BillingEventRecord,
  type BillingEventsPersistence,
} from "./billing-events.repository";

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    provider: "bachs" as const,
    environment: "sandbox" as const,
    eventId: "evt_123",
    eventType: "collection.succeeded",
    organizationId: "org_edutu",
    payload: {
      id: "evt_123",
      type: "collection.succeeded",
      created_at: "2026-08-11T10:00:00.000Z",
      organization_id: "org_edutu",
      data: { payment_id: "pay_123" },
    },
    rawPayload: Buffer.from(
      JSON.stringify({
        id: "evt_123",
        type: "collection.succeeded",
        created_at: "2026-08-11T10:00:00.000Z",
        organization_id: "org_edutu",
        data: { payment_id: "pay_123" },
      }),
    ),
    ...overrides,
  };
}

class MemoryEventsPersistence implements BillingEventsPersistence {
  readonly records = new Map<string, BillingEventRecord>();

  async insert(input: Parameters<BillingEventsPersistence["insert"]>[0]) {
    const key = `${input.provider}:${input.environment}:${input.eventId}`;
    const existing = this.records.get(key);
    if (existing) {
      return existing.payloadHash === input.payloadHash
        ? { kind: "duplicate" as const, event: existing }
        : { kind: "conflict" as const, event: existing };
    }
    const event: BillingEventRecord = {
      id: `row_${this.records.size + 1}`,
      provider: input.provider,
      environment: input.environment,
      eventId: input.eventId,
      eventType: input.eventType,
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

  async leaseBatch(
    input: Parameters<BillingEventsPersistence["leaseBatch"]>[0],
  ) {
    const eligible = [...this.records.values()]
      .filter(
        (event) =>
          (event.status === "received" || event.status === "failed") &&
          (!event.nextRetryAt || event.nextRetryAt <= input.now),
      )
      .slice(0, input.limit);
    for (const event of eligible) {
      event.status = "processing";
      event.attemptCount += 1;
    }
    return eligible;
  }

  async complete(id: string, now: Date) {
    const event = [...this.records.values()].find((item) => item.id === id);
    if (!event || event.status !== "processing") return false;
    event.status = "processed";
    event.processedAt = now;
    event.updatedAt = now;
    return true;
  }

  async retry(input: Parameters<BillingEventsPersistence["retry"]>[0]) {
    const event = [...this.records.values()].find(
      (item) => item.id === input.id,
    );
    if (!event || event.status !== "processing") return null;
    const deadLetter = input.attemptCount >= input.deadLetterAfter;
    event.status = deadLetter ? "dead_letter" : "failed";
    event.nextRetryAt = deadLetter ? null : input.nextRetryAt;
    event.lastError = input.error;
    return event;
  }

  async review(input: Parameters<BillingEventsPersistence["review"]>[0]) {
    const event = [...this.records.values()].find(
      (item) => item.id === input.id,
    );
    if (!event || event.status !== "processing") return false;
    event.status = "review";
    event.lastError = input.reason;
    return true;
  }
}

describe("BillingEventsRepository", () => {
  it("hashes raw bytes and treats same event ID with a different payload as a conflict", async () => {
    const persistence = new MemoryEventsPersistence();
    const repository = new BillingEventsRepository(persistence, {
      clock: () => new Date("2026-08-11T10:00:00.000Z"),
    });

    const first = await repository.accept(eventInput());
    const duplicate = await repository.accept(eventInput());
    const conflict = await repository.accept(
      eventInput({
        payload: { ...eventInput().payload, data: { payment_id: "pay_other" } },
        rawPayload: Buffer.from('{"different":true}'),
      }),
    );

    expect(first.kind).toBe("inserted");
    expect(duplicate.kind).toBe("duplicate");
    expect(conflict.kind).toBe("conflict");
    expect(persistence.records.size).toBe(1);
  });

  it("leases only bounded retryable events and transitions them to processing", async () => {
    const persistence = new MemoryEventsPersistence();
    const repository = new BillingEventsRepository(persistence, {
      clock: () => new Date("2026-08-11T10:00:00.000Z"),
    });
    await repository.accept(eventInput({ eventId: "evt_1" }));
    await repository.accept(eventInput({ eventId: "evt_2" }));
    await repository.accept(eventInput({ eventId: "evt_3" }));

    const leased = await repository.lease(2);

    expect(leased).toHaveLength(2);
    expect(leased.every((event) => event.status === "processing")).toBe(true);
    expect(leased.every((event) => event.attemptCount === 1)).toBe(true);
  });

  it("uses bounded exponential retry and dead-letters after the configured threshold", async () => {
    const persistence = new MemoryEventsPersistence();
    const now = new Date("2026-08-11T10:00:00.000Z");
    const repository = new BillingEventsRepository(persistence, {
      clock: () => now,
      retryBaseMs: 1_000,
      retryMaxMs: 8_000,
      deadLetterAfter: 3,
    });
    await repository.accept(eventInput());

    const [first] = await repository.lease(1);
    const retry1 = await repository.retry(first.id, "temporary outage");
    expect(retry1?.status).toBe("failed");
    expect(retry1?.nextRetryAt?.getTime()).toBe(now.getTime() + 1_000);

    now.setTime(now.getTime() + 1_000);
    const [second] = await repository.lease(1);
    const retry2 = await repository.retry(second.id, "temporary outage");
    expect(retry2?.nextRetryAt?.getTime()).toBe(now.getTime() + 2_000);

    now.setTime(now.getTime() + 2_000);
    const [third] = await repository.lease(1);
    const deadLetter = await repository.retry(third.id, "permanent outage");
    expect(deadLetter?.status).toBe("dead_letter");
    expect(deadLetter?.nextRetryAt).toBeNull();
  });

  it("does not complete an event unless it is currently leased", async () => {
    const persistence = new MemoryEventsPersistence();
    const repository = new BillingEventsRepository(persistence);
    await repository.accept(eventInput());
    const event = [...persistence.records.values()][0];

    await expect(repository.complete(event.id)).resolves.toBe(false);
    expect(event.status).toBe("received");
  });
});
