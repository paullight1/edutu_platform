import { createHash } from "crypto";

export type BillingEventProvider = "bachs" | "revenuecat";
export type BillingEventEnvironment = "sandbox" | "live";
export type BillingEventStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "dead_letter"
  | "review";

export interface BillingEventRecord {
  id: string;
  provider: BillingEventProvider;
  environment: BillingEventEnvironment;
  eventId: string;
  eventType: string;
  organizationId: string | null;
  providerAccountId: string | null;
  payloadHash: string;
  payload: unknown;
  status: BillingEventStatus;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  updatedAt: Date;
}

export interface BillingEventsPersistence {
  insert(input: {
    provider: BillingEventProvider;
    environment: BillingEventEnvironment;
    eventId: string;
    eventType: string;
    organizationId?: string;
    providerAccountId?: string;
    payloadHash: string;
    payload: unknown;
    receivedAt: Date;
  }): Promise<
    | { kind: "inserted"; event: BillingEventRecord }
    | { kind: "duplicate"; event: BillingEventRecord }
    | { kind: "conflict"; event: BillingEventRecord }
  >;
  leaseBatch(input: {
    now: Date;
    limit: number;
  }): Promise<BillingEventRecord[]>;
  complete(id: string, now: Date): Promise<boolean>;
  retry(input: {
    id: string;
    error: string;
    attemptCount: number;
    nextRetryAt: Date;
    deadLetterAfter: number;
  }): Promise<BillingEventRecord | null>;
  review(input: { id: string; reason: string }): Promise<boolean>;
}

export class BillingEventsRepository {
  private readonly clock: () => Date;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly deadLetterAfter: number;
  private readonly leasedAttempts = new Map<string, number>();

  constructor(
    private readonly persistence: BillingEventsPersistence,
    options: {
      clock?: () => Date;
      retryBaseMs?: number;
      retryMaxMs?: number;
      deadLetterAfter?: number;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 5 * 60_000;
    this.deadLetterAfter = options.deadLetterAfter ?? 8;
  }

  async accept(input: {
    provider: BillingEventProvider;
    environment: BillingEventEnvironment;
    eventId: string;
    eventType: string;
    organizationId?: string;
    providerAccountId?: string;
    payload: unknown;
    rawPayload: Buffer;
  }) {
    if (!Buffer.isBuffer(input.rawPayload)) {
      throw new TypeError("rawPayload must be a Buffer");
    }
    const payloadHash = createHash("sha256")
      .update(input.rawPayload)
      .digest("hex");
    return this.persistence.insert({
      ...input,
      payloadHash,
      receivedAt: this.clock(),
    });
  }

  async lease(limit = 100): Promise<BillingEventRecord[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RangeError("event lease limit must be between 1 and 1000");
    }
    const events = await this.persistence.leaseBatch({
      now: this.clock(),
      limit,
    });
    for (const event of events)
      this.leasedAttempts.set(event.id, event.attemptCount);
    return events;
  }

  complete(id: string): Promise<boolean> {
    return this.persistence.complete(id, this.clock());
  }

  async retry(id: string, error: string): Promise<BillingEventRecord | null> {
    const attemptCount = this.leasedAttempts.get(id) ?? 1;
    const delay = Math.min(
      this.retryMaxMs,
      this.retryBaseMs * 2 ** Math.max(0, attemptCount - 1),
    );
    const result = await this.persistence.retry({
      id,
      error: error.slice(0, 2_000),
      attemptCount,
      nextRetryAt: new Date(this.clock().getTime() + delay),
      deadLetterAfter: this.deadLetterAfter,
    });
    this.leasedAttempts.delete(id);
    return result;
  }

  review(id: string, reason: string): Promise<boolean> {
    return this.persistence.review({ id, reason: reason.slice(0, 2_000) });
  }
}
