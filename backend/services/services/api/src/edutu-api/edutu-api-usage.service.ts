import { Injectable, Logger } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { apiUsageEvents } from "../db/schema";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";
import {
  billingClassForEndpoint,
  EdutuApiBillingUnavailableError,
} from "./edutu-api-billing-policy";

export { EdutuApiBillingUnavailableError } from "./edutu-api-billing-policy";

export type SafeObservabilityLevel = "log" | "warn" | "error";

export interface SafeObservabilityFields {
  requestId?: string;
  consumerId?: string;
  ownerUserId?: string;
  method?: string;
  endpoint?: string;
  billingClass?: "free" | "credit" | "unknown";
  statusCode?: number;
  statusClass?: string;
  latencyMs?: number;
  provider?: string;
  environment?: string;
  outcome?: string;
  category?: string;
  count?: number;
  repaired?: number;
  reviewCases?: number;
  duplicates?: number;
  providerErrors?: number;
  alert?: string;
  runbook?: string;
}

const SAFE_OBSERVABILITY_KEYS = new Set<keyof SafeObservabilityFields>([
  "requestId",
  "consumerId",
  "ownerUserId",
  "method",
  "endpoint",
  "billingClass",
  "statusCode",
  "statusClass",
  "latencyMs",
  "provider",
  "environment",
  "outcome",
  "category",
  "count",
  "repaired",
  "reviewCases",
  "duplicates",
  "providerErrors",
  "alert",
  "runbook",
]);

function safeString(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/\r|\n/g, " ")
    .replace(String.fromCharCode(0), " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

/** Build structured telemetry from an explicit allowlist; arbitrary metadata is never copied. */
export function safeObservabilityEvent(
  event: string,
  fields: SafeObservabilityFields = {},
): Record<string, unknown> {
  const safeEvent =
    safeString(event, 80)?.replace(/[^a-zA-Z0-9_.:-]/g, "_") || "unknown";
  const record: Record<string, unknown> = {
    event: safeEvent,
    service: "edutu-api",
    occurredAt: new Date().toISOString(),
  };
  const candidate = fields as Record<string, unknown>;

  for (const key of SAFE_OBSERVABILITY_KEYS) {
    if (!(key in candidate)) continue;
    const value = candidate[key];
    if (typeof value === "string") {
      const normalized = safeString(value);
      if (normalized !== undefined) {
        record[key] =
          key === "endpoint" ? normalized.split(/[?#]/, 1)[0] : normalized;
      }
    } else if (typeof value === "number" && Number.isFinite(value)) {
      record[key] = value;
    }
  }
  return record;
}

export function logSafeObservability(
  logger: Pick<Logger, "log" | "warn" | "error">,
  event: string,
  fields: SafeObservabilityFields = {},
  level: SafeObservabilityLevel = "log",
): Record<string, unknown> {
  const record = safeObservabilityEvent(event, fields);
  logger[level](JSON.stringify(record));
  return record;
}

export interface QuotaReservation {
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  used: number | null;
}

export interface RateLimitReservation {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

export interface CreditReservation {
  /** Remaining balance after this request, or null when untracked/unknown. */
  balance: number | null;
  /** True only when the owner has a credit balance and it is spent. */
  exhausted: boolean;
}

interface RateWindow {
  windowStart: number;
  count: number;
}

const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_CONSUMERS = 10_000;

export function apiRequestIdempotencyKey(
  consumerId: string,
  ownerUserId: string,
  requestId: string,
): string {
  return `api:${consumerId}:${ownerUserId}:${requestId}`;
}

// Sentinel used to roll back the credit-reservation transaction when the owner
// has no credits left. Caught in reserveRequestCredit and mapped to null.
class InsufficientCreditsError extends Error {}

@Injectable()
export class EdutuApiUsageService {
  private readonly logger = new Logger(EdutuApiUsageService.name);
  // Per-instance fixed-window limiter. Accurate per replica; for a true
  // multi-instance deployment back this with Redis/Valkey (Phase 6).
  private readonly rateWindows = new Map<string, RateWindow>();

  async reserveMonthlyQuota(
    consumer: ApiConsumerContext,
  ): Promise<QuotaReservation> {
    if (consumer.id === "env" || consumer.monthlyQuota === null) {
      return {
        allowed: true,
        limit: null,
        remaining: null,
        resetAt: null,
        used: null,
      };
    }

    const quota = Math.max(Number(consumer.monthlyQuota) || 0, 0);
    if (quota <= 0) {
      return this.exhaustedReservation(quota);
    }

    const { periodStart, resetAt } = this.getCurrentPeriod();
    const result = await db.execute(sql`
      with bucket as (
        insert into api_usage_buckets (
          consumer_id,
          period_start,
          request_count,
          monthly_quota
        )
        values (
          ${consumer.id}::uuid,
          ${periodStart}::date,
          0,
          ${quota}
        )
        on conflict (consumer_id, period_start) do update
        set
          monthly_quota = excluded.monthly_quota,
          updated_at = now()
      ),
      updated as (
        update api_usage_buckets
        set
          request_count = request_count + 1,
          updated_at = now()
        where
          consumer_id = ${consumer.id}::uuid
          and period_start = ${periodStart}::date
          and request_count < ${quota}
        returning request_count, monthly_quota
      )
      select request_count, monthly_quota from updated
    `);

    const row = ((result as { rows?: unknown[] }).rows?.[0] ??
      (Array.isArray(result) ? result[0] : undefined)) as
      | { request_count?: number | string; monthly_quota?: number | string }
      | undefined;

    if (!row) {
      return this.exhaustedReservation(quota, resetAt);
    }

    const used = Number(row.request_count ?? 0);
    const limit = Number(row.monthly_quota ?? quota);

    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - used, 0),
      resetAt,
      used,
    };
  }

  /**
   * Enforce a per-consumer, per-minute request cap. Returns the reservation so
   * the guard can emit X-RateLimit-* headers and a 429 when the window is full.
   * Consumers with no rate limit configured (null) or internal env consumers
   * are allowed through unconditionally.
   */
  reserveRateLimit(consumer: ApiConsumerContext): RateLimitReservation {
    const limit =
      consumer.id === "env" || consumer.rateLimitPerMinute === null
        ? null
        : Math.max(Number(consumer.rateLimitPerMinute) || 0, 0);

    const now = Date.now();
    const windowResetMs = now + RATE_WINDOW_MS;

    if (limit === null || limit <= 0) {
      return {
        allowed: true,
        limit: 0,
        remaining: 0,
        resetAt: new Date(windowResetMs).toISOString(),
        retryAfterSeconds: 0,
      };
    }

    const key = consumer.id;
    const window = this.rateWindows.get(key);
    let entry: RateWindow;

    if (!window || window.windowStart + RATE_WINDOW_MS <= now) {
      entry = { windowStart: now, count: 1 };
    } else {
      entry = window;
      if (entry.count < limit) {
        entry.count += 1;
      } else {
        const retryAfterSeconds = Math.max(
          Math.ceil((entry.windowStart + RATE_WINDOW_MS - now) / 1000),
          1,
        );
        logSafeObservability(this.logger, "api_rate_limited", {
          requestId: consumer.requestId,
          consumerId: consumer.id,
          outcome: "rejected",
          category: "429",
        });
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: new Date(entry.windowStart + RATE_WINDOW_MS).toISOString(),
          retryAfterSeconds,
        };
      }
    }

    this.rateWindows.set(key, entry);
    this.pruneRateWindows(now);

    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - entry.count, 0),
      resetAt: new Date(entry.windowStart + RATE_WINDOW_MS).toISOString(),
      retryAfterSeconds: 0,
    };
  }

  private pruneRateWindows(now: number) {
    if (this.rateWindows.size < MAX_TRACKED_CONSUMERS) return;
    for (const [key, window] of this.rateWindows) {
      if (window.windowStart + RATE_WINDOW_MS <= now) {
        this.rateWindows.delete(key);
      }
    }
  }

  async recordUsageEvent(input: {
    consumer: ApiConsumerContext;
    requestId: string;
    method: string;
    endpoint: string;
    statusCode: number;
    latencyMs: number;
  }) {
    if (input.consumer.id === "env") return;

    logSafeObservability(this.logger, "api_request", {
      requestId: input.requestId,
      consumerId: input.consumer.id,
      ownerUserId: input.consumer.ownerUserId ?? undefined,
      method: input.method.toUpperCase(),
      endpoint: input.endpoint,
      billingClass: billingClassForEndpoint(input.method, input.endpoint),
      statusCode: input.statusCode,
      statusClass: `${Math.floor(input.statusCode / 100)}xx`,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      outcome: input.statusCode >= 400 ? "error" : "success",
    });

    try {
      await db
        .insert(apiUsageEvents)
        .values({
          consumerId: input.consumer.id,
          requestId: input.requestId,
          method: input.method,
          endpoint: input.endpoint,
          statusCode: input.statusCode,
          latencyMs: input.latencyMs,
        })
        .execute();
    } catch (error) {
      logSafeObservability(
        this.logger,
        "api_usage_recording_failed",
        { consumerId: input.consumer.id, outcome: "unavailable" },
        "warn",
      );
    }
  }

  async reserveRequestCredit(
    consumer: ApiConsumerContext,
    endpoint: string,
    method = "GET",
  ): Promise<CreditReservation> {
    if (billingClassForEndpoint(method, endpoint) === "free") {
      return {
        balance: await this.readCreditBalance(consumer.ownerUserId ?? null),
        exhausted: false,
      };
    }

    // Environment keys are explicitly internal and are not issued to normal
    // users. Database-backed consumers must always have an owner so a paid
    // request can be tied to the canonical credit ledger.
    if (consumer.id === "env") {
      return { balance: null, exhausted: false };
    }
    if (!consumer.id || !consumer.ownerUserId) {
      throw new EdutuApiBillingUnavailableError();
    }

    const ownerUserId = consumer.ownerUserId;
    const requestId = consumer.requestId?.trim();
    if (!requestId) {
      throw new EdutuApiBillingUnavailableError();
    }
    const idempotencyKey = apiRequestIdempotencyKey(
      consumer.id,
      ownerUserId,
      requestId,
    );
    const description = `Edutu API request: ${endpoint}`.slice(0, 200);

    try {
      return await db.transaction(async (tx) => {
        // profiles.credits is guarded by the protect_profile_privileged_columns
        // trigger; the RPCs set this flag before mutating credits, so we do the
        // same for our direct (service-role) write. Transaction-local.
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);

        // Find any stored API request reference before attempting the claim.
        // This is intentionally independent of the scoped unique conflict
        // tuple: a malformed row must not become chargeable merely because its
        // consumer or owner field no longer matches that tuple.
        const existing = await tx.execute(sql`
          select
            id,
            user_id,
            api_consumer_id,
            amount,
            type,
            related_id,
            related_type,
            api_request_idempotency_key
          from credit_transactions
          where
            related_id = ${requestId}
            or related_id = ${idempotencyKey}
            or api_request_idempotency_key = ${idempotencyKey}
          limit 2
        `);
        const existingRows = this.rows(existing);
        if (existingRows.length > 0) {
          return this.readVerifiedDuplicateReservation(
            tx,
            existingRows,
            consumer,
            ownerUserId,
            idempotencyKey,
          );
        }

        // Claim the request with a key scoped to both the authenticated
        // consumer and its owner. related_id remains populated with the same
        // scoped key so the legacy API index cannot create cross-owner
        // collisions. The dedicated API key index closes the race between two
        // simultaneous deliveries of the same request.
        const claim = await tx.execute(sql`
          insert into credit_transactions
            (
              user_id,
              amount,
              type,
              description,
              related_id,
              related_type,
              api_consumer_id,
              api_request_idempotency_key
            )
          values
            (
              ${ownerUserId},
              -1,
              'spend',
              ${description},
              ${idempotencyKey},
              'api_request',
              ${consumer.id},
              ${idempotencyKey}
            )
          on conflict (
            related_type,
            api_consumer_id,
            user_id,
            api_request_idempotency_key
          )
            where related_type = 'api_request'
              and api_consumer_id is not null
              and api_request_idempotency_key is not null
          do nothing
          returning id
        `);
        const claimed = this.rowCount(claim) > 0;

        // Duplicate delivery of an already-charged request: report the current
        // balance without charging again, but only for a matching API spend.
        if (!claimed) {
          const duplicate = await tx.execute(sql`
            select
              id,
              user_id,
              api_consumer_id,
              amount,
              type,
              related_id,
              related_type,
              api_request_idempotency_key
            from credit_transactions
            where
              related_id = ${requestId}
              or related_id = ${idempotencyKey}
              or api_request_idempotency_key = ${idempotencyKey}
            limit 2
          `);
          return this.readVerifiedDuplicateReservation(
            tx,
            this.rows(duplicate),
            consumer,
            ownerUserId,
            idempotencyKey,
          );
        }

        // Atomically decrement, but only while credits remain.
        const decremented = await tx.execute(sql`
          update profiles set credits = credits - 1, updated_at = now()
          where user_id = ${ownerUserId} and credits > 0
          returning credits
        `);

        // A missing row is ambiguous from the guarded UPDATE alone. Read the
        // profile inside the same transaction so confirmed zero is distinct
        // from a missing profile/database inconsistency.
        const balanceAfterDecrement = this.readProfileBalance(
          decremented,
          "credits",
        );
        if (balanceAfterDecrement === null) {
          const profile = await tx.execute(sql`
            select credits from profiles where user_id = ${ownerUserId} limit 1
          `);
          const profileBalance = this.readProfileBalance(profile, "credits");
          if (profileBalance === null) {
            throw new EdutuApiBillingUnavailableError();
          }
          if (profileBalance <= 0) {
            throw new InsufficientCreditsError();
          }
          throw new EdutuApiBillingUnavailableError();
        }

        return {
          balance: balanceAfterDecrement,
          exhausted: false,
        } satisfies CreditReservation;
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        logSafeObservability(this.logger, "api_credits_exhausted", {
          requestId,
          consumerId: consumer.id,
          ownerUserId,
          billingClass: "credit",
          outcome: "rejected",
          category: "402",
        });
        return { balance: 0, exhausted: true };
      }
      logSafeObservability(
        this.logger,
        "api_credit_unavailable",
        {
          requestId,
          consumerId: consumer.id,
          ownerUserId,
          billingClass: "credit",
          outcome: "unavailable",
          category: "503",
        },
        "warn",
      );
      if (error instanceof EdutuApiBillingUnavailableError) throw error;
      throw new EdutuApiBillingUnavailableError();
    }
  }

  private rowCount(result: unknown): number {
    const asObj = result as { rowCount?: number; rows?: unknown[] };
    if (Array.isArray(asObj?.rows)) return asObj.rows.length;
    if (typeof asObj?.rowCount === "number") return asObj.rowCount;
    if (Array.isArray(result)) return result.length;
    return 0;
  }

  private rows(result: unknown): Record<string, unknown>[] {
    const asObj = result as { rows?: unknown[] };
    if (Array.isArray(asObj?.rows)) {
      return asObj.rows.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      );
    }
    if (Array.isArray(result)) {
      return result.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      );
    }
    return [];
  }

  private readProfileBalance(result: unknown, column: string): number | null {
    const rows = this.rows(result);
    if (rows.length !== 1) return null;
    const value = Number(rows[0][column]);
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  private isMatchingApiLedgerRow(
    row: Record<string, unknown> | undefined,
    consumer: ApiConsumerContext,
    ownerUserId: string,
    idempotencyKey: string,
  ): boolean {
    return Boolean(
      row &&
      typeof row.id === "string" &&
      row.id.length > 0 &&
      String(row.user_id) === ownerUserId &&
      row.api_consumer_id === consumer.id &&
      Number(row.amount) === -1 &&
      row.type === "spend" &&
      row.related_type === "api_request" &&
      row.related_id === idempotencyKey &&
      row.api_request_idempotency_key === idempotencyKey &&
      idempotencyKey ===
        apiRequestIdempotencyKey(
          consumer.id,
          ownerUserId,
          consumer.requestId!.trim(),
        ),
    );
  }

  private async readVerifiedDuplicateReservation(
    tx: { execute(statement: SQL): Promise<unknown> },
    rows: Record<string, unknown>[],
    consumer: ApiConsumerContext,
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<CreditReservation> {
    if (
      rows.length !== 1 ||
      !this.isMatchingApiLedgerRow(
        rows[0],
        consumer,
        ownerUserId,
        idempotencyKey,
      )
    ) {
      throw new EdutuApiBillingUnavailableError();
    }

    const current = await tx.execute(sql`
      select credits from profiles where user_id = ${ownerUserId} limit 1
    `);
    const currentBalance = this.readProfileBalance(current, "credits");
    if (currentBalance === null) {
      throw new EdutuApiBillingUnavailableError();
    }
    return {
      balance: currentBalance,
      exhausted: false,
    } satisfies CreditReservation;
  }

  private exhaustedReservation(
    limit: number,
    resetAt = this.getCurrentPeriod().resetAt,
  ): QuotaReservation {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      used: limit,
    };
  }

  private getCurrentPeriod() {
    const now = new Date();
    const periodStartDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const resetAtDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    return {
      periodStart: periodStartDate.toISOString().slice(0, 10),
      resetAt: resetAtDate.toISOString(),
    };
  }

  async readCreditBalanceForConsumer(
    consumer: ApiConsumerContext,
  ): Promise<number | null> {
    return this.readCreditBalance(consumer.ownerUserId ?? null);
  }

  private async readCreditBalance(
    ownerUserId: string | null,
  ): Promise<number | null> {
    if (!ownerUserId) return null;

    try {
      const result = await db.execute(sql`
        select credits from profiles where user_id = ${ownerUserId} limit 1
      `);
      return this.readProfileBalance(result, "credits");
    } catch (error) {
      logSafeObservability(
        this.logger,
        "api_credit_balance_unavailable",
        { ownerUserId, outcome: "unavailable", category: "503" },
        "warn",
      );
      return null;
    }
  }
}
