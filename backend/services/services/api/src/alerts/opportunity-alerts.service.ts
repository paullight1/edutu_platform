import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  opportunities,
  opportunityAlertLedger,
  userOpportunitySignals,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { OpportunityRankingService } from "../opportunities/opportunity-ranking.service";

type QuietHours = { start: string; end: string } | null;

interface AlertCandidate {
  id: string;
  title: string;
  canonicalCategory: string | null;
}

interface ScoredOpportunity {
  id: string;
  match_score: number;
  match_reasons: string[];
}

interface DeadlinePair {
  userId: string;
  opportunityId: string;
  title: string;
  daysLeft: number;
  quietHours: QuietHours;
}

const DEFAULT_QUIET_HOURS = { start: "22:00", end: "08:00" };

// Tunables (env-overridable). Conservative by default: the fastest way to get
// push notifications disabled is to send too many of them.
const MIN_SCORE = Number(process.env.ALERTS_MIN_SCORE || 62);
const DAILY_CAP = Number(process.env.ALERTS_DAILY_CAP || 2);
const MAX_USERS_PER_RUN = Number(process.env.ALERTS_MAX_USERS_PER_RUN || 500);
const FRESH_WINDOW_HOURS = Number(process.env.ALERTS_FRESH_HOURS || 26);
const SCORE_BATCH = 50; // scoreOpportunitiesForUser caps at 50 ids
const USER_CONCURRENCY = 3;
const DEADLINE_OFFSETS = [1, 3, 7];
const MAX_DEADLINE_PUSHES_PER_USER = 3;

function alertsEnabled() {
  return process.env.OPPORTUNITY_ALERTS_ENABLED !== "false";
}

/**
 * Sends personalized push alerts:
 *
 * 1. Interest alerts — a daily pass over freshly ingested opportunities,
 *    scored per user with the same hybrid engine that powers the feed
 *    (profile-embedding similarity + weighted interaction signals: clicks,
 *    saves, shares, applies + category affinity). Only the best match above a
 *    confidence threshold is pushed, capped per day, never repeated
 *    (opportunity_alert_ledger), deferred through quiet hours.
 *
 * 2. Deadline reminders — 7/3/1 days before the deadline of any opportunity
 *    the user saved or applied to. Collapsed into a single summary push when
 *    several fall due on the same day.
 */
@Injectable()
export class OpportunityAlertsService {
  private readonly logger = new Logger(OpportunityAlertsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly rankingService: OpportunityRankingService,
  ) {}

  // 09:15 UTC: after the midnight scrape and several hourly embedding
  // backfills, and morning across the primarily African (UTC+0..+3) user base.
  @Cron("15 9 * * *")
  async runInterestAlertsCron() {
    if (!alertsEnabled()) return;
    try {
      const result = await this.runInterestAlerts();
      this.logger.log(`Interest alerts: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(
        `Interest alerts run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 07:45 UTC daily.
  @Cron("45 7 * * *")
  async runDeadlineRemindersCron() {
    if (!alertsEnabled()) return;
    try {
      const result = await this.runDeadlineReminders();
      this.logger.log(`Deadline reminders: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(
        `Deadline reminders run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ─── Interest alerts ──────────────────────────────────────────────────────

  async runInterestAlerts() {
    const candidates = await this.getFreshOpportunities();
    if (!candidates.length) {
      return { users: 0, notified: 0, reason: "no fresh opportunities" };
    }

    const users = await this.getEligibleUsers();
    if (!users.length) {
      return { users: 0, notified: 0, reason: "no eligible users" };
    }

    let notified = 0;
    let skipped = 0;

    await this.forEachWithConcurrency(users, USER_CONCURRENCY, async (user) => {
      try {
        const sent = await this.alertUser(user.userId, user.quietHours, candidates);
        if (sent) notified += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        this.logger.warn(
          `Interest alert failed for ${user.userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    return { users: users.length, candidates: candidates.length, notified, skipped };
  }

  private async alertUser(
    userId: string,
    quietHours: QuietHours,
    candidates: AlertCandidate[],
  ): Promise<boolean> {
    // Daily cap: interest alerts sent in the last 24h.
    const [{ count: sentToday }] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunityAlertLedger)
      .where(
        and(
          eq(opportunityAlertLedger.userId, userId),
          eq(opportunityAlertLedger.kind, "interest"),
          gte(opportunityAlertLedger.sentAt, new Date(Date.now() - 24 * 3600_000)),
        ),
      )) as [{ count: number }];
    if (sentToday >= DAILY_CAP) return false;

    const candidateIds = candidates.map((c) => c.id);

    // Never re-alert an opportunity, and never alert one the user has already
    // interacted with (they've seen it).
    const [alreadyAlerted, alreadySeen] = await Promise.all([
      db
        .select({ opportunityId: opportunityAlertLedger.opportunityId })
        .from(opportunityAlertLedger)
        .where(
          and(
            eq(opportunityAlertLedger.userId, userId),
            inArray(opportunityAlertLedger.opportunityId, candidateIds),
          ),
        ),
      db
        .select({ opportunityId: userOpportunitySignals.opportunityId })
        .from(userOpportunitySignals)
        .where(
          and(
            eq(userOpportunitySignals.userId, userId),
            inArray(userOpportunitySignals.opportunityId, candidateIds),
          ),
        ),
    ]);

    const excluded = new Set([
      ...alreadyAlerted.map((r) => r.opportunityId),
      ...alreadySeen.map((r) => r.opportunityId),
    ]);
    const remaining = candidates.filter((c) => !excluded.has(c.id));
    if (!remaining.length) return false;

    // Newest first, capped to what the scorer accepts per call.
    const toScore = remaining.slice(0, SCORE_BATCH);
    const { scores } = (await this.rankingService.scoreOpportunitiesForUser(
      userId,
      toScore.map((c) => c.id),
    )) as { scores: ScoredOpportunity[] };

    const eligible = scores
      .filter((s) => s.match_score >= MIN_SCORE)
      .sort((a, b) => b.match_score - a.match_score);
    if (!eligible.length) return false;

    const top = eligible[0];
    const topCandidate = toScore.find((c) => c.id === top.id);
    if (!topCandidate) return false;
    const others = eligible.length - 1;

    const reason = Array.isArray(top.match_reasons) && top.match_reasons[0];
    const body = [
      topCandidate.title,
      reason ? `— ${reason}` : null,
      others > 0 ? `(+${others} more new ${others === 1 ? "match" : "matches"})` : null,
    ]
      .filter(Boolean)
      .join(" ");

    await this.notificationsService.broadcast(userId, {
      title: `🎯 ${top.match_score}% match found for you`,
      body,
      kind: "opportunity-alert",
      severity: "info",
      audience: "specific",
      targetUserIds: [userId],
      channels: { inApp: true, push: true, email: false },
      dedupeKey: `interest:${userId}:${top.id}`,
      scheduledFor: this.deferForQuietHours(quietHours),
      metadata: {
        opportunityId: top.id,
        url: `/opportunities/${top.id}`,
        androidChannelId: "opportunities",
        matchScore: top.match_score,
        source: "interest-alerts",
      },
    });

    await db
      .insert(opportunityAlertLedger)
      .values({ userId, opportunityId: top.id, kind: "interest" })
      .onConflictDoNothing();

    return true;
  }

  private async getFreshOpportunities(): Promise<AlertCandidate[]> {
    const cutoff = new Date(Date.now() - FRESH_WINDOW_HOURS * 3600_000);
    const rows = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        canonicalCategory: opportunities.canonicalCategory,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.status, "active"),
          gte(opportunities.createdAt, cutoff),
          sql`(${opportunities.closeDate} is null or ${opportunities.closeDate} >= current_date)`,
        ),
      )
      .orderBy(desc(opportunities.createdAt))
      .limit(300);
    return rows;
  }

  /**
   * Users worth waking up: they have a push token, haven't opted out of
   * opportunity alerts, and were active (emitted signals) in the last 60 days.
   */
  private async getEligibleUsers(): Promise<
    Array<{ userId: string; quietHours: QuietHours }>
  > {
    const result = await db.execute(sql`
      select distinct t.user_id as user_id, p.quiet_hours as quiet_hours
      from notification_push_tokens t
      left join notification_preferences p on p.user_id = t.user_id
      where coalesce(p.push_notifications, true)
        and coalesce(p.opportunity_alerts, true)
        and exists (
          select 1 from user_opportunity_signals s
          where s.user_id = t.user_id
            and s.created_at > now() - interval '60 days'
        )
      limit ${MAX_USERS_PER_RUN}
    `);

    const rows =
      (result as unknown as {
        rows?: Array<{ user_id: string; quiet_hours: QuietHours }>;
      }).rows ?? [];
    return rows.map((row) => ({
      userId: row.user_id,
      quietHours: row.quiet_hours,
    }));
  }

  // ─── Deadline reminders ───────────────────────────────────────────────────

  async runDeadlineReminders() {
    const pairs = await this.getDueDeadlinePairs();
    if (!pairs.length) return { users: 0, notified: 0 };

    const byUser = new Map<string, DeadlinePair[]>();
    for (const pair of pairs) {
      const list = byUser.get(pair.userId) ?? [];
      list.push(pair);
      byUser.set(pair.userId, list);
    }

    let notified = 0;

    await this.forEachWithConcurrency(
      Array.from(byUser.entries()),
      USER_CONCURRENCY,
      async ([userId, userPairs]) => {
        try {
          notified += await this.remindUser(userId, userPairs);
        } catch (error) {
          this.logger.warn(
            `Deadline reminder failed for ${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      },
    );

    return { users: byUser.size, pairs: pairs.length, notified };
  }

  private async remindUser(userId: string, pairs: DeadlinePair[]) {
    const quietHours = pairs[0].quietHours;
    const scheduledFor = this.deferForQuietHours(quietHours);
    let sent = 0;

    // Too many at once reads as spam — collapse into a single summary push.
    if (pairs.length > MAX_DEADLINE_PUSHES_PER_USER) {
      const soonest = pairs.reduce((a, b) => (a.daysLeft <= b.daysLeft ? a : b));
      await this.notificationsService.broadcast(userId, {
        title: "⏰ Deadlines approaching",
        body: `${pairs.length} of your saved opportunities close soon — the first is "${soonest.title}" ${this.daysPhrase(soonest.daysLeft)}.`,
        kind: "deadline-reminder",
        severity: "warning",
        audience: "specific",
        targetUserIds: [userId],
        channels: { inApp: true, push: true, email: false },
        dedupeKey: `deadline-summary:${userId}:${new Date().toISOString().slice(0, 10)}`,
        scheduledFor,
        metadata: {
          url: "/opportunities",
          androidChannelId: "deadlines",
          source: "deadline-reminders",
        },
      });
      sent = 1;
    } else {
      for (const pair of pairs) {
        await this.notificationsService.broadcast(userId, {
          title: `⏰ Closing ${this.daysPhrase(pair.daysLeft)}`,
          body: `"${pair.title}" closes ${this.daysPhrase(pair.daysLeft)}. Don't miss it — your application matters.`,
          kind: "deadline-reminder",
          severity: pair.daysLeft <= 1 ? "critical" : "warning",
          audience: "specific",
          targetUserIds: [userId],
          channels: { inApp: true, push: true, email: false },
          dedupeKey: `deadline:${userId}:${pair.opportunityId}:${pair.daysLeft}d`,
          scheduledFor,
          metadata: {
            opportunityId: pair.opportunityId,
            url: `/opportunities/${pair.opportunityId}`,
            androidChannelId: "deadlines",
            daysLeft: pair.daysLeft,
            source: "deadline-reminders",
          },
        });
        sent += 1;
      }
    }

    await db
      .insert(opportunityAlertLedger)
      .values(
        pairs.map((pair) => ({
          userId,
          opportunityId: pair.opportunityId,
          kind: `deadline_${pair.daysLeft}d`,
        })),
      )
      .onConflictDoNothing();

    return sent;
  }

  /**
   * (user, opportunity) pairs where the user saved or applied and the
   * deadline is exactly 1, 3 or 7 days out — minus pairs already reminded at
   * that offset.
   */
  private async getDueDeadlinePairs(): Promise<DeadlinePair[]> {
    const result = await db.execute(sql`
      select distinct s.user_id as user_id,
             o.id as opportunity_id,
             o.title as title,
             (o.deadline::date - current_date) as days_left,
             p.quiet_hours as quiet_hours
      from user_opportunity_signals s
      join opportunities o on o.id = s.opportunity_id
      left join notification_preferences p on p.user_id = s.user_id
      where s.signal_type in ('save', 'apply')
        and o.status = 'active'
        and o.deadline is not null
        and (o.deadline::date - current_date) in (${sql.join(
          DEADLINE_OFFSETS.map((d) => sql`${d}`),
          sql`, `,
        )})
        and coalesce(p.push_notifications, true)
        and coalesce(p.deadline_reminders, true)
        and not exists (
          select 1 from opportunity_alert_ledger l
          where l.user_id = s.user_id
            and l.opportunity_id = o.id
            and l.kind = 'deadline_' || (o.deadline::date - current_date) || 'd'
        )
      limit 2000
    `);

    const rows =
      (result as unknown as {
        rows?: Array<{
          user_id: string;
          opportunity_id: string;
          title: string;
          days_left: number;
          quiet_hours: QuietHours;
        }>;
      }).rows ?? [];

    return rows.map((row) => ({
      userId: row.user_id,
      opportunityId: row.opportunity_id,
      title: row.title,
      daysLeft: Number(row.days_left),
      quietHours: row.quiet_hours,
    }));
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private daysPhrase(days: number) {
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days} days`;
  }

  /**
   * If "now" falls inside the user's quiet hours, returns an ISO timestamp at
   * the end of the window so the queue drainer delivers it then; otherwise
   * undefined (deliver immediately). Quiet hours are stored without a timezone
   * and treated as UTC; both crons run mid-morning across the primary
   * (UTC+0..+3) user base, so this only defers genuinely odd windows.
   */
  private deferForQuietHours(quietHours: QuietHours): string | undefined {
    const window = quietHours?.start && quietHours?.end ? quietHours : DEFAULT_QUIET_HOURS;
    const parse = (value: string) => {
      const [h, m] = value.split(":").map((part) => Number(part));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };

    const start = parse(window.start);
    const end = parse(window.end);
    if (start === null || end === null || start === end) return undefined;

    const now = new Date();
    const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();

    const inWindow =
      start < end
        ? nowMins >= start && nowMins < end
        : nowMins >= start || nowMins < end; // window wraps midnight

    if (!inWindow) return undefined;

    const target = new Date(now);
    target.setUTCHours(Math.floor(end / 60), end % 60, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.toISOString();
  }

  private async forEachWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    let index = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const item = items[index++];
          await worker(item);
        }
      },
    );
    await Promise.all(runners);
  }
}
