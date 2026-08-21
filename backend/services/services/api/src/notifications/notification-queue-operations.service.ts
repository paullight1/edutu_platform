import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";

type QueueHealthRow = {
  pending_count: string | number | null;
  processing_count: string | number | null;
  dead_letter_count: string | number | null;
  retrying_count: string | number | null;
  stale_processing_count: string | number | null;
  oldest_pending_seconds: string | number | null;
};

type RecoveryRow = {
  recovered: string | number | null;
};

@Injectable()
export class NotificationQueueOperationsService {
  private readonly logger = new Logger(NotificationQueueOperationsService.name);

  async getHealth() {
    const result = await db.execute(sql`
      select
        count(*) filter (where status = 'pending') as pending_count,
        count(*) filter (where status = 'processing') as processing_count,
        count(*) filter (where status = 'dead_letter') as dead_letter_count,
        count(*) filter (
          where status = 'pending' and attempt_count > 0
        ) as retrying_count,
        count(*) filter (
          where status = 'processing'
            and locked_at is not null
            and locked_at < now() - interval '15 minutes'
        ) as stale_processing_count,
        extract(
          epoch from (
            now() - min(scheduled_for) filter (where status = 'pending')
          )
        ) as oldest_pending_seconds
      from notification_queue
    `);

    const row = this.rows<QueueHealthRow>(result)[0] ?? {
      pending_count: 0,
      processing_count: 0,
      dead_letter_count: 0,
      retrying_count: 0,
      stale_processing_count: 0,
      oldest_pending_seconds: null,
    };

    const pending = this.number(row.pending_count);
    const processing = this.number(row.processing_count);
    const deadLetter = this.number(row.dead_letter_count);
    const retrying = this.number(row.retrying_count);
    const staleProcessing = this.number(row.stale_processing_count);
    const oldestPendingSeconds =
      row.oldest_pending_seconds == null
        ? null
        : Math.max(0, Math.round(this.number(row.oldest_pending_seconds)));

    return {
      pending,
      processing,
      deadLetter,
      retrying,
      staleProcessing,
      oldestPendingSeconds,
      healthy: deadLetter === 0 && staleProcessing === 0,
    };
  }

  @Cron("0 * * * * *")
  async recoverStaleProcessing() {
    try {
      const result = await db.execute(sql`
        select public.recover_stale_notification_queue() as recovered
      `);
      const recovered = this.number(
        this.rows<RecoveryRow>(result)[0]?.recovered ?? 0,
      );

      if (recovered > 0) {
        this.logger.warn(
          `Recovered ${recovered} stale notification queue lease(s)`,
        );
      }

      return { recovered };
    } catch (error) {
      this.logger.error(
        `Notification queue stale-lease recovery failed: ${this.errorMessage(error)}`,
      );
      return { recovered: 0 };
    }
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] } | null)?.rows ?? [];
  }

  private number(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
