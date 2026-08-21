import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";
import type { RateLimitReservation } from "./edutu-api-usage.service";

const RATE_WINDOW_MS = 60_000;

function unlimitedReservation(now = Date.now()): RateLimitReservation {
  return {
    allowed: true,
    limit: 0,
    remaining: 0,
    resetAt: new Date(now + RATE_WINDOW_MS).toISOString(),
    retryAfterSeconds: 0,
  };
}

function minuteWindowStart(now: number): Date {
  return new Date(Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS);
}

function resultRow(result: unknown):
  | { request_count?: number | string; window_start?: string | Date }
  | undefined {
  const withRows = result as { rows?: unknown[] };
  const row = withRows?.rows?.[0] ?? (Array.isArray(result) ? result[0] : undefined);
  return row as
    | { request_count?: number | string; window_start?: string | Date }
    | undefined;
}

@Injectable()
export class EdutuApiRateLimitService {
  /**
   * Reserve one request in a shared, database-backed minute bucket.
   *
   * The INSERT/ON CONFLICT statement is atomic across API replicas. When a
   * bucket has reached its configured limit, the conflict UPDATE's WHERE clause
   * declines the increment and RETURNING yields no row, which we map to 429.
   */
  async reserve(
    consumer: ApiConsumerContext,
  ): Promise<RateLimitReservation> {
    const configuredLimit =
      consumer.id === "env" || consumer.rateLimitPerMinute === null
        ? null
        : Number(consumer.rateLimitPerMinute);

    if (
      configuredLimit === null ||
      !Number.isFinite(configuredLimit) ||
      configuredLimit <= 0
    ) {
      return unlimitedReservation();
    }

    const limit = Math.max(1, Math.floor(configuredLimit));
    const now = Date.now();
    const windowStart = minuteWindowStart(now);
    const resetAtMs = windowStart.getTime() + RATE_WINDOW_MS;
    const resetAt = new Date(resetAtMs).toISOString();

    try {
      const result = await db.execute(sql`
        insert into api_rate_limit_buckets (
          consumer_id,
          window_start,
          request_count,
          rate_limit,
          updated_at
        )
        values (
          ${consumer.id}::uuid,
          ${windowStart.toISOString()}::timestamptz,
          1,
          ${limit},
          now()
        )
        on conflict (consumer_id, window_start) do update
        set
          request_count = api_rate_limit_buckets.request_count + 1,
          rate_limit = excluded.rate_limit,
          updated_at = now()
        where api_rate_limit_buckets.request_count < excluded.rate_limit
        returning request_count, window_start
      `);

      const row = resultRow(result);
      if (!row) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((resetAtMs - now) / 1000),
          ),
        };
      }

      const used = Math.max(0, Number(row.request_count ?? 0));
      return {
        allowed: true,
        limit,
        remaining: Math.max(limit - used, 0),
        resetAt,
        retryAfterSeconds: 0,
      };
    } catch {
      throw new Error("API rate limit unavailable");
    }
  }
}
