import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  BillingEventsRepository,
  type BillingEventEnvironment,
  type BillingEventRecord,
} from "./billing-events.repository";

const SUPPORTED_EVENT_TYPES = new Set([
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
]);

type QueryResult = { rows?: unknown[] };
export interface RevenueCatProcessorDatabase {
  execute(statement: SQL): Promise<QueryResult>;
}

export const REVENUECAT_PROCESSOR_DATABASE = Symbol(
  "REVENUECAT_PROCESSOR_DATABASE",
);
export const REVENUECAT_IDENTITY_RESOLVER = Symbol(
  "REVENUECAT_IDENTITY_RESOLVER",
);
export const REVENUECAT_LIFECYCLE_APPLIER = Symbol(
  "REVENUECAT_LIFECYCLE_APPLIER",
);

export interface RevenueCatIdentityResolver {
  resolve(candidates: readonly string[]): Promise<string | null>;
}

export interface RevenueCatLifecycleApplyInput {
  environment: BillingEventEnvironment;
  eventId: string;
  eventType: string;
  appUserId: string;
  productId: string | null;
  subscriptionLineageId: string | null;
  transactionId: string | null;
  occurredAt: Date;
  expiresAt: Date | null;
  payload: unknown;
}

export interface RevenueCatLifecycleApplyResult {
  outcome: "applied" | "duplicate" | "stale" | "review";
  userId?: string;
  tier?: "lite" | "pro" | "scholar" | null;
  reason?: string;
}

export interface RevenueCatLifecycleApplier {
  apply(
    input: RevenueCatLifecycleApplyInput,
  ): Promise<RevenueCatLifecycleApplyResult>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => item !== null)
    : [];
}

function dateFromMilliseconds(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCanonicalClerkCandidate(value: string): boolean {
  return /^user_[A-Za-z0-9_-]+$/.test(value) && !value.startsWith("$RC");
}

@Injectable()
export class PostgresRevenueCatIdentityResolver implements RevenueCatIdentityResolver {
  constructor(
    @Inject(REVENUECAT_PROCESSOR_DATABASE)
    private readonly database: RevenueCatProcessorDatabase = db as unknown as RevenueCatProcessorDatabase,
  ) {}

  async resolve(candidates: readonly string[]): Promise<string | null> {
    const allowed = [...new Set(candidates.filter(isCanonicalClerkCandidate))];
    if (allowed.length === 0) return null;
    const result = await this.database.execute(sql`
      select wanted.user_id
      from unnest(${allowed}::text[]) with ordinality as wanted(user_id, position)
      where exists (
        select 1 from public.profiles profile
        where profile.user_id::text = wanted.user_id
      ) or exists (
        select 1 from public.billing_identity_aliases identity
        where identity.canonical_user_id = wanted.user_id
      )
      order by wanted.position
      limit 1
    `);
    const row = (result.rows?.[0] ?? null) as { user_id?: unknown } | null;
    return stringValue(row?.user_id);
  }
}

@Injectable()
export class PostgresRevenueCatLifecycleApplier implements RevenueCatLifecycleApplier {
  constructor(
    @Inject(REVENUECAT_PROCESSOR_DATABASE)
    private readonly database: RevenueCatProcessorDatabase = db as unknown as RevenueCatProcessorDatabase,
  ) {}

  async apply(
    input: RevenueCatLifecycleApplyInput,
  ): Promise<RevenueCatLifecycleApplyResult> {
    const result = await this.database.execute(sql`
      select public.billing_apply_revenuecat_subscription_event(
        ${input.environment},
        ${input.eventId},
        ${input.eventType},
        ${input.appUserId},
        ${input.productId},
        ${input.subscriptionLineageId},
        ${input.transactionId},
        ${input.occurredAt.toISOString()}::timestamptz,
        ${input.expiresAt?.toISOString() ?? null}::timestamptz,
        ${JSON.stringify(input.payload)}::jsonb
      ) as result
    `);
    const row = (result.rows?.[0] ?? null) as { result?: unknown } | null;
    const value =
      typeof row?.result === "string" ? JSON.parse(row.result) : row?.result;
    const parsed = record(value);
    const outcome = stringValue(parsed?.outcome);
    if (
      !outcome ||
      !["applied", "duplicate", "stale", "review"].includes(outcome)
    ) {
      throw new Error(
        "RevenueCat lifecycle authority returned an invalid outcome",
      );
    }
    return parsed as unknown as RevenueCatLifecycleApplyResult;
  }
}

@Injectable()
export class RevenueCatEventProcessor {
  private readonly logger = new Logger(RevenueCatEventProcessor.name);

  constructor(
    private readonly events: BillingEventsRepository,
    @Inject(REVENUECAT_IDENTITY_RESOLVER)
    private readonly identities: RevenueCatIdentityResolver,
    @Inject(REVENUECAT_LIFECYCLE_APPLIER)
    private readonly lifecycle: RevenueCatLifecycleApplier,
  ) {}

  async processBatch(limit = 100): Promise<{
    processed: number;
    retried: number;
    reviewed: number;
  }> {
    const summary = { processed: 0, retried: 0, reviewed: 0 };
    const leased = await this.events.lease(limit, { provider: "revenuecat" });
    for (const inboxEvent of leased) {
      const outcome = await this.processOne(inboxEvent);
      summary[outcome] += 1;
    }
    return summary;
  }

  private async processOne(
    inboxEvent: BillingEventRecord,
  ): Promise<"processed" | "retried" | "reviewed"> {
    try {
      const normalized = await this.normalize(inboxEvent);
      if (normalized.kind === "review") {
        if (!(await this.events.review(inboxEvent.id, normalized.reason))) {
          throw new Error("RevenueCat inbox review transition failed");
        }
        return "reviewed";
      }
      if (normalized.kind === "noop") {
        if (!(await this.events.complete(inboxEvent.id))) {
          throw new Error("RevenueCat inbox completion failed");
        }
        return "processed";
      }

      const result = await this.lifecycle.apply(normalized.input);
      if (result.outcome === "review") {
        if (
          !(await this.events.review(
            inboxEvent.id,
            "revenuecat_lifecycle_review",
          ))
        ) {
          throw new Error("RevenueCat inbox review transition failed");
        }
        return "reviewed";
      }
      if (!(await this.events.complete(inboxEvent.id))) {
        throw new Error("RevenueCat inbox completion failed");
      }
      return "processed";
    } catch {
      this.logger.error(
        JSON.stringify({
          event: "revenuecat_lifecycle_apply_failed",
          inboxEventId: inboxEvent.id,
        }),
      );
      await this.events.retry(
        inboxEvent.id,
        "revenuecat_lifecycle_apply_failed",
      );
      return "retried";
    }
  }

  private async normalize(
    inboxEvent: BillingEventRecord,
  ): Promise<
    | { kind: "apply"; input: RevenueCatLifecycleApplyInput }
    | { kind: "noop" }
    | { kind: "review"; reason: string }
  > {
    if (inboxEvent.provider !== "revenuecat") {
      return { kind: "review", reason: "unexpected_provider" };
    }
    const payload = record(inboxEvent.payload);
    const event = record(payload?.event);
    const eventType = stringValue(event?.type);
    const eventId = stringValue(event?.id);
    if (!payload || !event || !eventType || eventId !== inboxEvent.eventId) {
      return { kind: "review", reason: "invalid_revenuecat_event" };
    }
    if (eventType === "TEST") return { kind: "noop" };
    if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
      return { kind: "review", reason: "unsupported_revenuecat_event_type" };
    }
    const occurredAt = dateFromMilliseconds(event.event_timestamp_ms);
    if (!occurredAt) {
      return { kind: "review", reason: "invalid_revenuecat_event_time" };
    }

    const payloadCandidates = stringArray(payload.identityCandidates);
    const candidates = [
      ...payloadCandidates,
      ...stringArray(event.aliases),
      stringValue(event.app_user_id),
      stringValue(event.original_app_user_id),
    ].filter((candidate): candidate is string => candidate !== null);
    const canonicalCandidates = [...new Set(candidates)].filter(
      isCanonicalClerkCandidate,
    );
    const appUserId = await this.identities.resolve(canonicalCandidates);
    if (!appUserId) {
      return { kind: "review", reason: "unresolved_revenuecat_identity" };
    }

    let canonicalPayload: unknown = inboxEvent.payload;
    if (eventType === "TRANSFER") {
      const from = await this.identities.resolve(
        stringArray(event.transferred_from).filter(isCanonicalClerkCandidate),
      );
      const to = await this.identities.resolve(
        stringArray(event.transferred_to).filter(isCanonicalClerkCandidate),
      );
      if (!from || !to || to !== appUserId) {
        return { kind: "review", reason: "unresolved_transfer_identity" };
      }
      canonicalPayload = {
        ...payload,
        event: {
          ...event,
          app_user_id: appUserId,
          original_app_user_id: appUserId,
          transferred_from: [from],
          transferred_to: [to],
        },
      };
    }

    return {
      kind: "apply",
      input: {
        environment: inboxEvent.environment,
        eventId,
        eventType,
        appUserId,
        productId: stringValue(event.product_id),
        subscriptionLineageId:
          stringValue(event.original_transaction_id) ??
          stringValue(payload.subscriptionLineageKey) ??
          stringValue(event.transaction_id),
        transactionId:
          stringValue(event.transaction_id) ??
          stringValue(payload.paidPeriodKey),
        occurredAt,
        expiresAt: dateFromMilliseconds(event.expiration_at_ms),
        payload: canonicalPayload,
      },
    };
  }
}

@Injectable()
export class RevenueCatEventScheduler {
  private active = false;

  constructor(private readonly processor: RevenueCatEventProcessor) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<unknown> {
    if (this.active) return { skipped: true };
    this.active = true;
    try {
      return await this.processor.processBatch();
    } finally {
      this.active = false;
    }
  }
}
