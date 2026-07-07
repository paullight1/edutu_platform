import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { apiUsageEvents } from "../db/schema";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";

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
      this.logger.warn(
        `Unable to record Edutu API usage event: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async reserveRequestCredit(
    consumer: ApiConsumerContext,
    endpoint: string,
  ): Promise<CreditReservation> {
    if (
      consumer.id === "env" ||
      !consumer.ownerUserId ||
      this.isCreditFreeEndpoint(endpoint)
    ) {
      return {
        balance: await this.readCreditBalance(consumer.ownerUserId ?? null),
        exhausted: false,
      };
    }

    const ownerUserId = consumer.ownerUserId;
    const requestId = consumer.requestId ?? null;
    const description = `Edutu API request: ${endpoint}`.slice(0, 200);

    try {
      return await db.transaction(async (tx) => {
        // profiles.credits is guarded by the protect_profile_privileged_columns
        // trigger; the RPCs set this flag before mutating credits, so we do the
        // same for our direct (service-role) write. Transaction-local.
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);

        // Claim the request by inserting its ledger row first. The partial
        // unique index on (related_type, related_id) makes a retry of the same
        // requestId a no-op, so one request is never charged twice. type is
        // 'spend' (constrained enum); the API row is tagged via related_type.
        let claimed = true;
        if (requestId) {
          const claim = await tx.execute(sql`
            insert into credit_transactions
              (user_id, amount, type, description, related_id, related_type)
            values
              (${ownerUserId}, -1, 'spend', ${description}, ${requestId}, 'api_request')
            on conflict (related_type, related_id)
              where related_id is not null
                and related_type in ('api_request', 'api_credit_purchase')
            do nothing
            returning id
          `);
          claimed = this.rowCount(claim) > 0;
        } else {
          await tx.execute(sql`
            insert into credit_transactions
              (user_id, amount, type, description, related_id, related_type)
            values
              (${ownerUserId}, -1, 'spend', ${description}, null, 'api_request')
          `);
        }

        // Duplicate delivery of an already-charged request: report the current
        // balance without charging again.
        if (!claimed) {
          const current = await tx.execute(sql`
            select credits from profiles where user_id = ${ownerUserId} limit 1
          `);
          return {
            balance: this.readNumber(current, "credits"),
            exhausted: false,
          } satisfies CreditReservation;
        }

        // Atomically decrement, but only while credits remain.
        const decremented = await tx.execute(sql`
          update profiles set credits = credits - 1, updated_at = now()
          where user_id = ${ownerUserId} and credits > 0
          returning credits
        `);

        // Insufficient credits: roll back the ledger insert so no charge is
        // recorded, and signal exhaustion to the caller.
        if (this.rowCount(decremented) === 0) {
          throw new InsufficientCreditsError();
        }

        return {
          balance: this.readNumber(decremented, "credits"),
          exhausted: false,
        } satisfies CreditReservation;
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return { balance: 0, exhausted: true };
      }
      // Infrastructure failure while charging: fail open rather than blocking
      // paying consumers on a transient DB error.
      this.logger.warn(
        `Unable to reserve API credit: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return { balance: null, exhausted: false };
    }
  }

  private rowCount(result: unknown): number {
    const asObj = result as { rowCount?: number; rows?: unknown[] };
    if (Array.isArray(asObj?.rows)) return asObj.rows.length;
    if (typeof asObj?.rowCount === "number") return asObj.rowCount;
    if (Array.isArray(result)) return result.length;
    return 0;
  }

  // Reads a numeric column from the first row of a raw db.execute() result.
  private readNumber(result: unknown, column: string): number {
    const rows =
      (result as { rows?: Record<string, unknown>[] }).rows ??
      (Array.isArray(result) ? (result as Record<string, unknown>[]) : []);
    return Number(rows[0]?.[column] ?? 0) || 0;
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

  private isCreditFreeEndpoint(endpoint: string) {
    return /\/v1\/(usage|health)(?:\/|$)/i.test(endpoint);
  }

  private async readCreditBalance(
    ownerUserId: string | null,
  ): Promise<number | null> {
    if (!ownerUserId) return null;

    try {
      const result = await db.execute(sql`
        select credits from profiles where user_id = ${ownerUserId} limit 1
      `);
      return this.readNumber(result, "credits");
    } catch (error) {
      this.logger.warn(
        `Unable to read API credit balance: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return null;
    }
  }
}
