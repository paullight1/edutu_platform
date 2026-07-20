import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { NotificationsService } from "./notifications.service";
import type { BroadcastNotificationDto } from "./dto/notification.dto";

type ExpiringEntitlement = {
  user_id: string;
  expires_at: string;
};

// Days before expiry we ping. Our GH/NG users mostly pay by mobile money or
// bank transfer, which Paystack can't auto-renew — so "renewal" is a nudge to
// come back and pay again, not a silent charge. A short series (a few days out,
// then on the day) recovers far more than a single expiry-day ping.
const REMINDER_OFFSETS = [3, 1, 0];

/**
 * Pro-expiry re-engagement reminders.
 *
 * One-time Paystack charges (the default in our market) grant a fixed period
 * written to billing_entitlements.expires_at with no auto-renew. Without a
 * nudge, users simply lapse silently. This job schedules a short reminder
 * series for every active entitlement about to expire, framed around what they
 * lose ("keep your CV exports, keep early deadline access"), each carrying a
 * deep link straight to the paywall so renewing is one tap.
 */
@Injectable()
export class ProExpiryRemindersService {
  private readonly logger = new Logger(ProExpiryRemindersService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runScheduled() {
    if (process.env.PRO_EXPIRY_REMINDERS_ENABLED === "false") return;
    try {
      const result = await this.scheduleUpcoming();
      if (result.users > 0) {
        this.logger.log(
          `Pro expiry reminders: ${result.scheduled} scheduled across ${result.users} expiring subscribers`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Pro expiry reminder run failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async scheduleUpcoming(limit = 5000) {
    const candidates = await this.getExpiring(limit);
    if (!candidates.length) return { users: 0, scheduled: 0 };

    let scheduled = 0;
    for (const candidate of candidates) {
      try {
        const result =
          await this.notificationsService.replaceScheduledUserNotifications(
            candidate.user_id,
            `pro-expiry:${candidate.user_id}`,
            this.buildReminders(candidate),
          );
        scheduled += result.scheduled;
      } catch (error) {
        this.logger.warn(
          `Could not schedule expiry reminders for ${candidate.user_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { users: candidates.length, scheduled };
  }

  /**
   * Active 'pro' entitlements expiring within the next 4 days. Only users who
   * will NOT be auto-renewed get a nudge — genuine recurring Paystack
   * subscriptions are excluded.
   *
   * IMPORTANT: the billing webhook upserts an 'active' billing_subscriptions
   * row for EVERY charge, including the one-time mobile-money/transfer charges
   * this reminder targets. For those, provider_subscription_id falls back to
   * the transaction reference ('edutu_…'); only a real recurring subscription
   * carries a Paystack subscription code ('SUB_…'). So we exclude on that code
   * prefix, not on the mere existence of an active row (which would drop every
   * payer and send nothing).
   */
  private async getExpiring(limit: number) {
    const result = await db.execute(sql`
      select e.user_id, e.expires_at
      from public.billing_entitlements e
      where e.feature_key = 'pro'
        and e.status = 'active'
        and e.expires_at is not null
        and e.expires_at between now() and now() + interval '4 days'
        and not exists (
          select 1 from public.billing_subscriptions s
          where s.user_id = e.user_id
            and s.status = 'active'
            and s.provider_subscription_id like 'SUB%'
        )
      limit ${limit}
    `);
    return this.rows<ExpiringEntitlement>(result);
  }

  private buildReminders(
    candidate: ExpiringEntitlement,
  ): BroadcastNotificationDto[] {
    const expires = new Date(candidate.expires_at);
    if (Number.isNaN(expires.getTime())) return [];

    return REMINDER_OFFSETS.map((daysBefore) => {
      const scheduledFor = new Date(expires);
      scheduledFor.setUTCDate(scheduledFor.getUTCDate() - daysBefore);
      scheduledFor.setUTCHours(9, 0, 0, 0);

      const title =
        daysBefore === 0
          ? "Your Edutu Pro expires today"
          : `Your Edutu Pro expires in ${daysBefore} day${daysBefore === 1 ? "" : "s"}`;

      return {
        title,
        body:
          daysBefore === 0
            ? "Renew now to keep unlimited AI help, CV exports, and early deadline access. Tap to renew — card, mobile money, or transfer."
            : "Don't lose your edge on the next scholarship. Renew to keep unlimited AI, CV exports, and early deadline access.",
        kind: "system" as const,
        severity: daysBefore <= 1 ? "warning" : "info",
        scheduledFor: scheduledFor.toISOString(),
        dedupeKey: `pro-expiry:${candidate.user_id}:${daysBefore}`,
        metadata: {
          deepLink: "edutu://paywall",
          expiresAt: expires.toISOString(),
          daysBefore,
        },
      };
    });
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    const rows = (result as { rows?: unknown })?.rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
}
