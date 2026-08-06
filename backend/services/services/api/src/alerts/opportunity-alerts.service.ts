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
import { AiService } from "../ai";
import { deferForQuietHours, type QuietHours } from "../common/quiet-hours";

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

interface EligibleUser {
  userId: string;
  quietHours: QuietHours;
  timezone: string | null;
  firstName: string | null;
}

interface AlertPick {
  id: string;
  title: string;
  score: number;
  reason: string | null;
  othersCount: number;
}

interface DocNudge {
  userId: string;
  applicationId: string;
  opportunityId: string;
  title: string;
  daysLeft: number;
  missing: string[]; // required roles still absent: 'cv' | 'sop'
  quietHours: QuietHours;
  timezone: string | null;
}

// Tunables (env-overridable). Conservative by default: the fastest way to get
// push notifications disabled is to send too many of them.
const MIN_SCORE = Number(process.env.ALERTS_MIN_SCORE || 62);
const DAILY_CAP = Number(process.env.ALERTS_DAILY_CAP || 2);
const MAX_USERS_PER_RUN = Number(process.env.ALERTS_MAX_USERS_PER_RUN || 500);
const FRESH_WINDOW_HOURS = Number(process.env.ALERTS_FRESH_HOURS || 26);
// When no fresh opportunity clears the bar for a user, fall back to their top
// personalized matches from the whole active catalog (never-alerted only).
const BACKFILL_ENABLED = process.env.ALERTS_BACKFILL !== "false";
const SCORE_BATCH = 50; // scoreOpportunitiesForUser caps at 50 ids
const USER_CONCURRENCY = 3;
// Offsets for the win-coach document nudge only. Deadline reminders proper
// live in OpportunityDeadlineRemindersService (14/7/3/1/0).
const DEADLINE_OFFSETS = [1, 3, 7];

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
 * 2. Win-coach document nudges — an application whose deadline nears while a
 *    required document (CV / SOP) is still missing.
 *
 * Deadline reminders themselves are NOT sent here. They are owned entirely by
 * OpportunityDeadlineRemindersService, which pre-schedules a 14/7/3/1/0 ladder
 * from a wider candidate set. This service used to run its own same-day
 * 7/3/1 cron off user_opportunity_signals, which meant a user who had both
 * saved an opportunity and started an application received the same
 * "deadline-reminder" from three different jobs under three different dedupe
 * keys. The doc nudge below now enriches that series (via loadNextActions)
 * and only sends standalone when no reminder is scheduled for the pair.
 */
@Injectable()
export class OpportunityAlertsService {
  private readonly logger = new Logger(OpportunityAlertsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly rankingService: OpportunityRankingService,
    private readonly aiService: AiService,
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

  // ─── Interest alerts ──────────────────────────────────────────────────────

  async runInterestAlerts() {
    // No early return on an empty fresh batch: the personalized backfill can
    // still find never-alerted high matches in the standing catalog.
    const candidates = await this.getFreshOpportunities();

    const users = await this.getEligibleUsers();
    if (!users.length) {
      return { users: 0, notified: 0, reason: "no eligible users" };
    }

    let notified = 0;
    let skipped = 0;

    await this.forEachWithConcurrency(users, USER_CONCURRENCY, async (user) => {
      try {
        const sent = await this.alertUser(user, candidates);
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

    return {
      users: users.length,
      candidates: candidates.length,
      notified,
      skipped,
    };
  }

  private async alertUser(
    user: EligibleUser,
    candidates: AlertCandidate[],
  ): Promise<boolean> {
    const { userId } = user;
    // Daily cap: interest alerts sent in the last 24h.
    const [{ count: sentToday }] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunityAlertLedger)
      .where(
        and(
          eq(opportunityAlertLedger.userId, userId),
          eq(opportunityAlertLedger.kind, "interest"),
          gte(
            opportunityAlertLedger.sentAt,
            new Date(Date.now() - 24 * 3600_000),
          ),
        ),
      )) as [{ count: number }];
    if (sentToday >= DAILY_CAP) return false;

    let pick = candidates.length
      ? await this.pickFromFresh(userId, candidates)
      : null;
    if (!pick && BACKFILL_ENABLED) {
      pick = await this.pickFromRecommendations(userId);
    }
    if (!pick) return false;

    const copy = await this.composePulseCopy(user, pick);
    const prompt = `Why is "${pick.title}" a good match for me, and how do I win it?`;

    await this.notificationsService.broadcast(userId, {
      title: copy.title,
      body: copy.body,
      kind: "opportunity-alert",
      severity: "info",
      audience: "specific",
      targetUserIds: [userId],
      channels: { inApp: true, push: true, email: false },
      dedupeKey: `interest:${userId}:${pick.id}`,
      scheduledFor: deferForQuietHours(user.quietHours, user.timezone),
      metadata: {
        opportunityId: pick.id,
        // The pulse lands in chat with a ready-to-send question — the coach
        // explains the fit and can take it from there (roadmap, goals, CV).
        url: `/chat?prefill=${encodeURIComponent(prompt)}`,
        opportunityUrl: `/opportunities/${pick.id}`,
        androidChannelId: "opportunities",
        matchScore: pick.score,
        source: "interest-alerts",
      },
    });

    await db
      .insert(opportunityAlertLedger)
      .values({ userId, opportunityId: pick.id, kind: "interest" })
      .onConflictDoNothing();

    // The engine learns what it proactively surfaced (weight +1).
    void this.rankingService
      .recordSignal(userId, {
        opportunityId: pick.id,
        signalType: "recommended_in_chat",
        signalValue: 1,
        source: "alerts",
        context: "push_pulse",
      })
      .catch(() => undefined);

    return true;
  }

  /** Original path: best fresh (recently ingested) opportunity for this user. */
  private async pickFromFresh(
    userId: string,
    candidates: AlertCandidate[],
  ): Promise<AlertPick | null> {
    const candidateIds = candidates.map((c) => c.id);

    // Never re-alert an opportunity, and never alert one the user has already
    // interacted with (they've seen it).
    const excluded = await this.getExcludedIds(userId, candidateIds);
    const remaining = candidates.filter((c) => !excluded.has(c.id));
    if (!remaining.length) return null;

    // Newest first, capped to what the scorer accepts per call.
    const toScore = remaining.slice(0, SCORE_BATCH);
    const { scores } = (await this.rankingService.scoreOpportunitiesForUser(
      userId,
      toScore.map((c) => c.id),
    )) as { scores: ScoredOpportunity[] };

    const eligible = scores
      .filter((s) => s.match_score >= MIN_SCORE)
      .sort((a, b) => b.match_score - a.match_score);
    if (!eligible.length) return null;

    const top = eligible[0];
    const topCandidate = toScore.find((c) => c.id === top.id);
    if (!topCandidate) return null;

    return {
      id: top.id,
      title: topCandidate.title,
      score: Math.round(top.match_score),
      reason:
        (Array.isArray(top.match_reasons) && top.match_reasons[0]) || null,
      othersCount: eligible.length - 1,
    };
  }

  /**
   * Backfill: the user's top personalized matches from the whole catalog,
   * minus anything already alerted or interacted with. Reaches users the
   * fresh window misses (new profiles, slow scrape days).
   */
  private async pickFromRecommendations(
    userId: string,
  ): Promise<AlertPick | null> {
    const response = await this.rankingService.getRecommendationsForUser(
      userId,
      { limit: 25, minMatchScore: MIN_SCORE },
    );
    const rows = (response?.opportunities ?? []) as Array<{
      id: string;
      title: string;
      match: number;
      match_reasons?: string[];
    }>;
    if (!rows.length) return null;

    const excluded = await this.getExcludedIds(
      userId,
      rows.map((row) => row.id),
    );
    const top = rows.find((row) => row.id && !excluded.has(row.id));
    if (!top) return null;

    return {
      id: top.id,
      title: top.title,
      score: Math.round(top.match),
      reason: top.match_reasons?.[0] ?? null,
      othersCount: 0,
    };
  }

  private async getExcludedIds(
    userId: string,
    candidateIds: string[],
  ): Promise<Set<string>> {
    if (!candidateIds.length) return new Set();
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
    return new Set(
      [
        ...alreadyAlerted.map((r) => r.opportunityId),
        ...alreadySeen.map((r) => r.opportunityId),
      ].filter((id): id is string => Boolean(id)),
    );
  }

  /**
   * Jovial one-liner from the coach (route coach.pulse), falling back to the
   * plain template whenever the model is slow, disabled, or over-long.
   */
  private async composePulseCopy(
    user: EligibleUser,
    pick: AlertPick,
  ): Promise<{ title: string; body: string }> {
    const fallback = {
      title: `🎯 ${pick.score}% match found for you`,
      body: [
        pick.title,
        pick.reason ? `— ${pick.reason}` : null,
        pick.othersCount > 0
          ? `(+${pick.othersCount} more new ${pick.othersCount === 1 ? "match" : "matches"})`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    };

    try {
      const generated = await this.aiService.generateJson<{
        title?: string;
        body?: string;
      }>({
        feature: "coach.pulse",
        userId: user.userId,
        prompt: [
          "Write ONE push notification from Edutu Coach — warm, upbeat, personal, like a sharp friend who just spotted something great. No hype-spam, no ALL CAPS.",
          `User first name: ${user.firstName || "there"}`,
          `Opportunity: ${pick.title}`,
          `Match: ${pick.score}%`,
          pick.reason ? `Why it fits: ${pick.reason}` : "",
          'Return JSON {"title": "...", "body": "..."} — title ≤ 40 chars (one emoji ok), body ≤ 110 chars, must mention the opportunity name or what it is, invite them to hear why it fits.',
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: { source: "coach-pulse", userId: user.userId },
      });
      const title = String(generated?.title ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const body = String(generated?.body ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (title && body && title.length <= 60 && body.length <= 160) {
        return { title, body };
      }
    } catch (error) {
      this.logger.debug(
        `coach.pulse copy fell back to template: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return fallback;
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
   * opportunity alerts, and either were active (signals in the last 60 days)
   * OR have a profile embedding — so a brand-new personalized user gets
   * pulses before their first interaction.
   */
  private async getEligibleUsers(): Promise<EligibleUser[]> {
    const result = await db.execute(sql`
      select distinct t.user_id as user_id,
             p.quiet_hours as quiet_hours,
             -- profiles.user_id is text and dual-keyed: some rows hold the raw
             -- Clerk id, others the derived uuid — match both or half the
             -- profiles come back null and quiet hours evaluate in UTC.
             -- Correlated subqueries (not a join) so a dual-keyed match can
             -- never fan out into duplicate pushes.
             (
               select pr.timezone
               from profiles pr
               where (pr.user_id = t.user_id::text
                      or public.clerk_id_to_uuid(pr.user_id)::text = t.user_id::text)
                 and pr.timezone is not null
               order by pr.updated_at desc nulls last
               limit 1
             ) as timezone,
             (
               select pr.full_name
               from profiles pr
               where (pr.user_id = t.user_id::text
                      or public.clerk_id_to_uuid(pr.user_id)::text = t.user_id::text)
                 and pr.full_name is not null
               order by pr.updated_at desc nulls last
               limit 1
             ) as full_name
      from notification_push_tokens t
      left join notification_preferences p on p.user_id = t.user_id
      where coalesce(p.push_notifications, true)
        and coalesce(p.opportunity_alerts, true)
        and (
          exists (
            -- signals.user_id is text in the live schema; tokens.user_id is uuid
            select 1 from user_opportunity_signals s
            where s.user_id = t.user_id::text
              and s.created_at > now() - interval '60 days'
          )
          or exists (
            -- user_profile_embeddings.user_id is text (live schema drift)
            select 1 from user_profile_embeddings e
            where e.user_id = t.user_id::text
          )
        )
      limit ${MAX_USERS_PER_RUN}
    `);

    const rows =
      (
        result as unknown as {
          rows?: Array<{
            user_id: string;
            quiet_hours: QuietHours;
            timezone: string | null;
            full_name: string | null;
          }>;
        }
      ).rows ?? [];
    return rows.map((row) => ({
      userId: row.user_id,
      quietHours: row.quiet_hours,
      timezone: row.timezone,
      firstName: row.full_name ? row.full_name.split(/\s+/)[0] : null,
    }));
  }

  // ─── Win-coach: incomplete-application nudges ─────────────────────────────

  // Nudges users whose in-flight applications are missing a required document
  // (CV / SOP) as the deadline nears AND who have no scheduled deadline
  // reminder for that opportunity — when one exists it already carries the
  // missing document as its next action, so a second push is pure duplication.
  @Cron("30 8 * * *")
  async runApplicationDocNudgesCron() {
    if (process.env.AI_WINCOACH_ENABLED === "false") return;
    try {
      const result = await this.scanApplicationCompleteness();
      this.logger.log(
        `win-coach doc nudges: ${result.notified}/${result.candidates} sent`,
      );
    } catch (error) {
      this.logger.warn(
        `win-coach doc nudges failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * One nudge per application whose deadline is 7/3/1 days out, that is still
   * missing a required document, and that has NO pending deadline reminder
   * scheduled by OpportunityDeadlineRemindersService. Deduped through
   * opportunity_alert_ledger (kind docs_Nd), quiet-hours deferred, keyed on the
   * same app user id the deadline reminders use.
   */
  async scanApplicationCompleteness(): Promise<{
    candidates: number;
    notified: number;
  }> {
    const nudges = await this.getIncompleteApplicationNudges();
    if (!nudges.length) return { candidates: 0, notified: 0 };

    let notified = 0;
    await this.forEachWithConcurrency(
      nudges,
      USER_CONCURRENCY,
      async (nudge) => {
        try {
          notified += await this.sendDocNudge(nudge);
        } catch (error) {
          this.logger.warn(
            `doc nudge failed for ${nudge.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      },
    );
    return { candidates: nudges.length, notified };
  }

  private async sendDocNudge(nudge: DocNudge): Promise<number> {
    const kind = `docs_${nudge.daysLeft}d`;
    // Reserve the ledger slot first; only push if this is the first time we've
    // nudged this application at this offset (race-safe dedup).
    const inserted = await db
      .insert(opportunityAlertLedger)
      .values({
        userId: nudge.userId,
        opportunityId: nudge.opportunityId,
        kind,
      })
      .onConflictDoNothing()
      .returning({ userId: opportunityAlertLedger.userId });
    if (!inserted.length) return 0;

    const copy = this.describeMissingDocs(
      nudge.missing,
      nudge.daysLeft,
      nudge.title,
    );
    const prompt = `Help me finish my ${nudge.missing
      .map((role) => role.toUpperCase())
      .join(" and ")} for "${nudge.title}" before the deadline.`;

    await this.notificationsService.broadcast(nudge.userId, {
      title: copy.title,
      body: copy.body,
      kind: "deadline-reminder",
      severity: nudge.daysLeft <= 1 ? "critical" : "warning",
      audience: "specific",
      targetUserIds: [nudge.userId],
      channels: { inApp: true, push: true, email: false },
      dedupeKey: `docs:${nudge.userId}:${nudge.opportunityId}:${nudge.daysLeft}d`,
      scheduledFor: deferForQuietHours(nudge.quietHours, nudge.timezone),
      metadata: {
        opportunityId: nudge.opportunityId,
        applicationId: nudge.applicationId,
        // Lands in chat ready to finish the missing document with the coach.
        url: `/chat?prefill=${encodeURIComponent(prompt)}`,
        opportunityUrl: `/opportunities/${nudge.opportunityId}`,
        androidChannelId: "deadlines",
        daysLeft: nudge.daysLeft,
        source: "win-coach-doc-nudges",
      },
    });
    return 1;
  }

  /** Push copy for a missing-document nudge (pure — unit tested). */
  private describeMissingDocs(
    missing: string[],
    daysLeft: number,
    title: string,
  ): { title: string; body: string } {
    const label =
      missing
        .map((role) => (role === "cv" ? "CV" : role === "sop" ? "SOP" : role))
        .join(" and ") || "documents";
    const verb = missing.length > 1 ? "are" : "is";
    return {
      title: `📝 Finish before "${title}" closes`,
      body: `"${title}" closes ${this.daysPhrase(daysLeft)} and your ${label} ${verb} still a draft. Want me to help you finish?`,
    };
  }

  private async getIncompleteApplicationNudges(): Promise<DocNudge[]> {
    const result = await db.execute(sql`
      select a.user_id as user_id,
             a.id as application_id,
             o.id as opportunity_id,
             o.title as title,
             (o.deadline::date - current_date) as days_left,
             p.quiet_hours as quiet_hours,
             -- profiles.user_id is dual-keyed (raw Clerk id or derived uuid) —
             -- match both, via a correlated subquery so it can't fan out rows
             -- and duplicate doc nudges.
             (
               select pr.timezone
               from profiles pr
               where (pr.user_id = a.user_id
                      or public.clerk_id_to_uuid(pr.user_id)::text = a.user_id)
                 and pr.timezone is not null
               order by pr.updated_at desc nulls last
               limit 1
             ) as timezone,
             not exists (
               select 1 from application_documents d
               where d.application_id = a.id and d.role = 'cv' and d.status <> 'missing'
             ) as cv_missing,
             not exists (
               select 1 from application_documents d
               where d.application_id = a.id and d.role = 'sop' and d.status <> 'missing'
             ) as sop_missing
      from opportunity_applications a
      join opportunities o on o.id = a.opportunity_id
      left join notification_preferences p on p.user_id::text = a.user_id
      where a.status <> 'submitted'
        and o.status = 'active'
        and o.deadline is not null
        and (o.deadline::date - current_date) in (${sql.join(
          DEADLINE_OFFSETS.map((d) => sql`${d}`),
          sql`, `,
        )})
        and coalesce(p.push_notifications, true)
        and coalesce(p.deadline_reminders, true)
        and (
          not exists (
            select 1 from application_documents d
            where d.application_id = a.id and d.role = 'cv' and d.status <> 'missing'
          )
          or not exists (
            select 1 from application_documents d
            where d.application_id = a.id and d.role = 'sop' and d.status <> 'missing'
          )
        )
        and not exists (
          select 1 from opportunity_alert_ledger l
          where l.user_id::text = a.user_id
            and l.opportunity_id = o.id
            and l.kind = 'docs_' || (o.deadline::date - current_date) || 'd'
        )
        -- ENRICH, DON'T DUPLICATE. OpportunityDeadlineRemindersService
        -- pre-schedules a reminder series per (user, opportunity) under the
        -- dedupePrefix 'opp-deadline:<id>', and its next-action line already
        -- names the missing CV/SOP. If one of those is pending, this standalone
        -- nudge would be the same message a second time under a different
        -- dedupe key — exactly the duplication this consolidation removes.
        -- The queue's metadata.userId is the derived uuid, while
        -- opportunity_applications.user_id may hold the raw Clerk id, so match
        -- both representations.
        and not exists (
          select 1 from notification_queue q
          where q.status = 'pending'
            and q.payload->'metadata'->>'dedupePrefix' = 'opp-deadline:' || o.id::text
            and (
              q.payload->'metadata'->>'userId' = a.user_id
              or q.payload->'metadata'->>'userId'
                 = public.clerk_id_to_uuid(a.user_id)::text
            )
        )
      limit 2000
    `);

    const rows =
      (
        result as unknown as {
          rows?: Array<{
            user_id: string;
            application_id: string;
            opportunity_id: string;
            title: string;
            days_left: number;
            quiet_hours: QuietHours;
            timezone: string | null;
            cv_missing: boolean;
            sop_missing: boolean;
          }>;
        }
      ).rows ?? [];

    return rows.map((row) => ({
      userId: row.user_id,
      applicationId: row.application_id,
      opportunityId: row.opportunity_id,
      title: row.title,
      daysLeft: Number(row.days_left),
      missing: [
        ...(row.cv_missing ? ["cv"] : []),
        ...(row.sop_missing ? ["sop"] : []),
      ],
      quietHours: row.quiet_hours,
      timezone: row.timezone,
    }));
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private daysPhrase(days: number) {
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days} days`;
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
