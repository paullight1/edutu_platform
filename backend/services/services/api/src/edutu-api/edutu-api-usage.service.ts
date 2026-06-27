import { Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { apiUsageEvents, profiles, transactions } from "../db/schema";
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

interface RateWindow {
  windowStart: number;
  count: number;
}

const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_CONSUMERS = 10_000;

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
  ): Promise<number | null> {
    if (
      consumer.id === "env" ||
      !consumer.ownerUserId ||
      this.isCreditFreeEndpoint(endpoint)
    ) {
      return this.readCreditBalance(consumer.ownerUserId ?? null);
    }

    try {
      const [updated] = await db
        .update(profiles)
        .set({
          creditsBalance: sql`${profiles.creditsBalance} - 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(profiles.userId, consumer.ownerUserId),
            gt(profiles.creditsBalance, 0),
          ),
        )
        .returning({
          creditsBalance: profiles.creditsBalance,
        })
        .execute();

      if (!updated) {
        return null;
      }

      const remaining = Number(updated.creditsBalance ?? 0);

      await db
        .insert(transactions)
        .values({
          userId: consumer.ownerUserId,
          amount: -1,
          type: "api_request",
          status: "completed",
          referenceId: consumer.requestId ?? null,
          description: `Edutu API request: ${endpoint}`,
        })
        .execute();

      return remaining;
    } catch (error) {
      this.logger.warn(
        `Unable to reserve API credit: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return null;
    }
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

  private async readCreditBalance(ownerUserId: string | null) {
    if (!ownerUserId) return null;

    try {
      const [profile] = await db
        .select({ creditsBalance: profiles.creditsBalance })
        .from(profiles)
        .where(eq(profiles.userId, ownerUserId))
        .limit(1)
        .execute();

      return Number(profile?.creditsBalance ?? 0);
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
