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

@Injectable()
export class EdutuApiUsageService {
  private readonly logger = new Logger(EdutuApiUsageService.name);

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
}
