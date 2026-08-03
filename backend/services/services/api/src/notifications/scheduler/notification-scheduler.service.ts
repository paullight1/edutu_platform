import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { NotificationsService } from "../notifications.service";
import type {
  BroadcastNotificationDto,
  NotificationKind,
  NotificationSeverity,
} from "../dto/notification.dto";
import {
  buildOpenHourHistogram,
  countConsecutiveUnopened,
  rankCandidates,
  resolveSendTime,
} from "./notification-scheduler.scoring";
import {
  rows,
  type KindEngagement,
  type NotificationCandidateRow,
  type ScorableCandidate,
  type UserSchedulingContext,
} from "./notification-scheduler.types";

/** Candidates pulled per run. Generous — collapsing shrinks it hard. */
const CANDIDATE_LIMIT = 2000;

/** Trailing window over which engagement is measured. */
const ENGAGEMENT_WINDOW_DAYS = 30;

/** How far back the unopened-streak scan looks (in delivered notifications). */
const STREAK_LOOKBACK = 20;

/** Opens sampled per user when inferring their preferred send hour. */
const OPEN_HISTORY_LIMIT = 200;

/**
 * The scheduling layer between senders and the transport.
 *
 * Senders enqueue `notification_candidates`; this job decides which of them a
 * user actually hears about, and when. Per user it scores every pending
 * candidate (urgency × relevance × recency × engagement), collapses everything
 * about the same entity to a single winner, damps kinds the user has been
 * ignoring, picks a local send time, and hands the survivors to
 * `NotificationsService.broadcast()` — the one chokepoint that owns in-app
 * rows, push, email, the per-user push budget and quiet hours. None of that is
 * reimplemented here.
 *
 * ── SHIPS INERT ──────────────────────────────────────────────────────────────
 * Nothing writes `notification_candidates` yet and no sender has been converted
 * to this path; every existing sender still calls `broadcast()` directly. This
 * layer only becomes real once enough `delivered_at` / `opened_at` telemetry
 * exists (migration 20260803120000) to calibrate the scoring against. Until
 * then it is dead code by design and the cron is a no-op.
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * NOTE THE INVERTED DEFAULT — do not "fix" this to match its neighbours.
   *
   * Every other cron flag in this codebase is opt-OUT (`=== "false"` disables)
   * because those jobs are proven in production. This one is opt-IN: only the
   * exact string "true" turns it on. An unproven ranking layer that silently
   * activates on deploy would start reordering and *suppressing* real user
   * notifications with scoring weights nobody has ever validated against live
   * open rates. The blast radius of a wrong default here is "users stop being
   * told about deadlines", so the safe default is off.
   */
  private isEnabled(): boolean {
    return process.env.NOTIFICATION_SCHEDULER_V2_ENABLED === "true";
  }

  @Cron("0 */15 * * * *")
  async runScheduled() {
    if (!this.isEnabled()) return;
    try {
      const result = await this.drain();
      if (result.sent > 0) {
        this.logger.log(
          `Scheduler: ${result.sent} sent, ${result.collapsed} collapsed, ${result.users} users`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Notification scheduler run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * One full pass: load → rank → consume → broadcast.
   *
   * Deliberately thin — every judgement call lives in a pure helper in
   * `notification-scheduler.scoring.ts` so it can be tested without a database.
   */
  async drain(
    limit = CANDIDATE_LIMIT,
    now: Date = new Date(),
  ): Promise<{
    users: number;
    considered: number;
    collapsed: number;
    sent: number;
  }> {
    const candidates = await this.loadPendingCandidates(limit);
    if (!candidates.length) {
      return { users: 0, considered: 0, collapsed: 0, sent: 0 };
    }

    const byUser = new Map<string, ScorableCandidate[]>();
    for (const candidate of candidates) {
      const bucket = byUser.get(candidate.userId);
      if (bucket) bucket.push(candidate);
      else byUser.set(candidate.userId, [candidate]);
    }

    const userIds = [...byUser.keys()];
    const kinds = [...new Set(candidates.map((c) => c.kind))];

    const [contexts, globalOpenRateByKind] = await Promise.all([
      this.loadUserContexts(userIds),
      this.loadGlobalOpenRates(kinds),
    ]);

    let sent = 0;
    let collapsed = 0;

    for (const [userId, userCandidates] of byUser) {
      const context = contexts.get(userId);
      const winners = rankCandidates({
        candidates: userCandidates,
        engagementByKind: context?.engagementByKind ?? new Map(),
        globalOpenRateByKind,
        now,
      });
      collapsed += userCandidates.length - winners.length;
      if (!winners.length) continue;

      const scheduledFor = resolveSendTime({
        now,
        timezone: context?.timezone ?? null,
        openHourCounts: context?.openHourCounts ?? null,
        totalOpens: context?.totalOpens ?? 0,
      }).toISOString();

      for (const winner of winners) {
        // Consume first: a broadcast failure must not leave a candidate that
        // gets re-picked (and re-sent) on the next tick.
        const consumed = await this.markConsumed(winner.id);
        if (!consumed) continue;

        try {
          await this.notificationsService.broadcast(
            userId,
            this.toBroadcastDto(winner, userId, scheduledFor),
          );
          sent += 1;
        } catch (error) {
          this.logger.error(
            `Scheduled broadcast failed for candidate ${winner.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return {
      users: byUser.size,
      considered: candidates.length,
      collapsed,
      sent,
    };
  }

  /**
   * Builds the transport payload. Quiet hours are intentionally NOT applied —
   * `broadcast()` evaluates them itself, and deferring twice would push the
   * notification a full extra window into the future.
   */
  private toBroadcastDto(
    candidate: ScorableCandidate,
    userId: string,
    scheduledFor: string,
  ): BroadcastNotificationDto {
    const payload = candidate.payload ?? {};
    const asString = (value: unknown, fallback: string) =>
      typeof value === "string" && value.trim() ? value.trim() : fallback;

    return {
      title: asString(payload.title, "Edutu"),
      body: asString(payload.body, ""),
      kind: candidate.kind as NotificationKind,
      severity: (typeof payload.severity === "string"
        ? payload.severity
        : "info") as NotificationSeverity,
      audience: "specific",
      targetUserIds: [userId],
      dedupeKey:
        typeof payload.dedupeKey === "string"
          ? payload.dedupeKey
          : `sched:${candidate.kind}:${candidate.entityType ?? "none"}:${candidate.entityId ?? candidate.id}`,
      metadata: {
        ...((payload.metadata as Record<string, unknown> | undefined) ?? {}),
        schedulerCandidateId: candidate.id,
      },
      scheduledFor,
    };
  }

  /** Pending, unexpired candidates, oldest first. */
  private async loadPendingCandidates(
    limit: number,
  ): Promise<ScorableCandidate[]> {
    const result = await db.execute(sql`
      select id::text            as id,
             user_id::text       as user_id,
             kind,
             entity_type,
             entity_id,
             payload,
             urgency,
             relevance,
             expires_at,
             created_at,
             consumed_at
      from public.notification_candidates
      where consumed_at is null
        and (expires_at is null or expires_at > now())
      order by created_at asc
      limit ${limit}
    `);

    return rows<NotificationCandidateRow>(result).map((row) => ({
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      entityType: row.entity_type ?? null,
      entityId: row.entity_id ?? null,
      payload: row.payload ?? {},
      urgency: this.toNumber(row.urgency, 0.5),
      relevance: this.toNumber(row.relevance, 1),
      createdAt: new Date(row.created_at),
    }));
  }

  /** `numeric` arrives as a string from node-postgres. */
  private toNumber(value: string | number, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /** Claims a candidate. Returns false if another run already took it. */
  private async markConsumed(candidateId: string): Promise<boolean> {
    const result = await db.execute(sql`
      update public.notification_candidates
      set consumed_at = now()
      where id = ${candidateId}::uuid
        and consumed_at is null
      returning id::text as id
    `);
    return rows<{ id: string }>(result).length > 0;
  }

  /** Global (all-user) open rate per kind over the engagement window. */
  private async loadGlobalOpenRates(
    kinds: string[],
  ): Promise<Map<string, number>> {
    const rates = new Map<string, number>();
    if (!kinds.length) return rates;

    const result = await db.execute(sql`
      select kind,
             count(*) filter (where delivered_at is not null)                          as delivered_count,
             count(*) filter (where delivered_at is not null and opened_at is not null) as opened_count
      from public.notifications
      where kind = any(array[${sql.join(
        kinds.map((kind) => sql`${kind}`),
        sql`, `,
      )}]::text[])
        and delivered_at >= now() - ${`${ENGAGEMENT_WINDOW_DAYS} days`}::interval
      group by kind
    `);

    for (const row of rows<{
      kind: string;
      delivered_count: string | number;
      opened_count: string | number;
    }>(result)) {
      const delivered = this.toNumber(row.delivered_count, 0);
      const opened = this.toNumber(row.opened_count, 0);
      rates.set(row.kind, delivered > 0 ? opened / delivered : 0);
    }
    return rates;
  }

  /** Timezone, open-hour histogram and per-kind engagement for each user. */
  private async loadUserContexts(
    userIds: string[],
  ): Promise<Map<string, UserSchedulingContext>> {
    const contexts = new Map<string, UserSchedulingContext>();
    if (!userIds.length) return contexts;

    const [timezones, engagement, streaks, opens] = await Promise.all([
      this.loadTimezones(userIds),
      this.loadEngagement(userIds),
      this.loadUnopenedStreaks(userIds),
      this.loadOpenHistory(userIds),
    ]);

    for (const userId of userIds) {
      const timezone = timezones.get(userId) ?? null;
      const histogram = buildOpenHourHistogram(
        opens.get(userId) ?? [],
        timezone,
      );
      const engagementByKind = engagement.get(userId) ?? new Map();
      for (const [kind, stats] of engagementByKind) {
        stats.consecutiveUnopened = streaks.get(`${userId}|${kind}`) ?? 0;
      }

      contexts.set(userId, {
        userId,
        timezone,
        openHourCounts: histogram.counts,
        totalOpens: histogram.total,
        engagementByKind,
      });
    }

    return contexts;
  }

  /**
   * Timezone per user.
   *
   * The `profiles` lookup is a DUAL-KEYED correlated subquery because
   * `profiles.user_id` is TEXT and holds either the raw Clerk id or the derived
   * uuid depending on which write path created the row. A plain
   * `join profiles on profiles.user_id = u.user_id` silently matches only half
   * the population — the other half then gets scheduled in UTC. Same shape as
   * `loadDeliveryPreferences` in notifications.service.ts.
   */
  private async loadTimezones(
    userIds: string[],
  ): Promise<Map<string, string | null>> {
    const result = await db.execute(sql`
      select u.user_id::text as user_id,
             (
               select pr.timezone
               from profiles pr
               where (pr.user_id = u.user_id::text
                      or public.clerk_id_to_uuid(pr.user_id)::text = u.user_id::text)
                 and pr.timezone is not null
               order by pr.updated_at desc nulls last
               limit 1
             ) as timezone
      from unnest(array[${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]) as u(user_id)
    `);

    const timezones = new Map<string, string | null>();
    for (const row of rows<{ user_id: string; timezone: string | null }>(
      result,
    )) {
      timezones.set(row.user_id, row.timezone ?? null);
    }
    return timezones;
  }

  /** Delivered/opened counters per (user, kind) over the engagement window. */
  private async loadEngagement(
    userIds: string[],
  ): Promise<Map<string, Map<string, KindEngagement>>> {
    const result = await db.execute(sql`
      select user_id::text as user_id,
             kind,
             count(*) filter (where delivered_at is not null)                           as delivered_count,
             count(*) filter (where delivered_at is not null and opened_at is not null) as opened_count,
             max(delivered_at)                                                          as last_delivered_at
      from public.notifications
      where user_id = any(array[${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[])
        and delivered_at >= now() - ${`${ENGAGEMENT_WINDOW_DAYS} days`}::interval
      group by user_id, kind
    `);

    const byUser = new Map<string, Map<string, KindEngagement>>();
    for (const row of rows<{
      user_id: string;
      kind: string;
      delivered_count: string | number;
      opened_count: string | number;
      last_delivered_at: string | null;
    }>(result)) {
      const forUser =
        byUser.get(row.user_id) ?? new Map<string, KindEngagement>();
      forUser.set(row.kind, {
        deliveredCount: this.toNumber(row.delivered_count, 0),
        openedCount: this.toNumber(row.opened_count, 0),
        consecutiveUnopened: 0,
        lastDeliveredAt: row.last_delivered_at
          ? new Date(row.last_delivered_at)
          : null,
      });
      byUser.set(row.user_id, forUser);
    }
    return byUser;
  }

  /** Current delivered-but-unopened run length, keyed `${userId}|${kind}`. */
  private async loadUnopenedStreaks(
    userIds: string[],
  ): Promise<Map<string, number>> {
    const result = await db.execute(sql`
      select user_id, kind, opened
      from (
        select user_id::text as user_id,
               kind,
               (opened_at is not null) as opened,
               row_number() over (
                 partition by user_id, kind order by delivered_at desc
               ) as rn
        from public.notifications
        where user_id = any(array[${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[])
          and delivered_at is not null
      ) recent
      where rn <= ${STREAK_LOOKBACK}
      order by user_id, kind, rn asc
    `);

    const flags = new Map<string, boolean[]>();
    for (const row of rows<{
      user_id: string;
      kind: string;
      opened: boolean;
    }>(result)) {
      const key = `${row.user_id}|${row.kind}`;
      const list = flags.get(key) ?? [];
      list.push(Boolean(row.opened));
      flags.set(key, list);
    }

    const streaks = new Map<string, number>();
    for (const [key, list] of flags) {
      streaks.set(key, countConsecutiveUnopened(list));
    }
    return streaks;
  }

  /** Recent `opened_at` instants per user, for the send-time histogram. */
  private async loadOpenHistory(
    userIds: string[],
  ): Promise<Map<string, Date[]>> {
    const result = await db.execute(sql`
      select user_id, opened_at
      from (
        select user_id::text as user_id,
               opened_at,
               row_number() over (
                 partition by user_id order by opened_at desc
               ) as rn
        from public.notifications
        where user_id = any(array[${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[])
          and opened_at is not null
      ) recent
      where rn <= ${OPEN_HISTORY_LIMIT}
    `);

    const opens = new Map<string, Date[]>();
    for (const row of rows<{ user_id: string; opened_at: string }>(result)) {
      const list = opens.get(row.user_id) ?? [];
      list.push(new Date(row.opened_at));
      opens.set(row.user_id, list);
    }
    return opens;
  }
}
