import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { NotificationsService } from "./notifications.service";
import type { BroadcastNotificationDto } from "./dto/notification.dto";

const DEFAULT_GHOST_DAYS = 45;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The nudge is queued a few minutes out rather than sent inline: the shared
// queue path (processDueQueue → deliverBroadcast) applies quiet-hours deferral
// at delivery, and replaceScheduledUserNotifications only persists items whose
// scheduledFor clears a 30-second floor.
const SCHEDULE_DELAY_MS = 5 * 60_000;

export type GhostApplicationRow = {
  application_id: string;
  user_id: string;
  title: string | null;
  status: string;
  submitted_at: string | Date | null;
};

/**
 * Resolved silence threshold in days. Defaults to 45 whenever
 * APPLICATION_GHOST_DAYS is unset, non-numeric, or non-positive so a malformed
 * env can never widen or invert the window.
 */
export function ghostThresholdDays(): number {
  const raw = Number(process.env.APPLICATION_GHOST_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GHOST_DAYS;
}

/**
 * Pure builder for the single ghost-closure nudge an application earns, or
 * null when it isn't (yet) a ghost — any non-`submitted` status, a missing or
 * invalid `submitted_at`, or fewer than `thresholdDays` elapsed. Kept
 * side-effect-free so candidate selection and copy are unit-testable without a
 * database; the SQL in {@link ApplicationGhostClosureService} applies the same
 * predicate at the set level.
 */
export function buildGhostNudge(
  row: GhostApplicationRow,
  options: { thresholdDays: number; now?: Date },
): BroadcastNotificationDto | null {
  if (row.status !== "submitted") return null;
  if (!row.submitted_at) return null;

  const submittedAt = new Date(row.submitted_at);
  if (Number.isNaN(submittedAt.getTime())) return null;

  const now = options.now ?? new Date();
  const daysSilent = Math.floor(
    (now.getTime() - submittedAt.getTime()) / MS_PER_DAY,
  );
  if (daysSilent < options.thresholdDays) return null;

  const weeks = Math.floor(daysSilent / 7);
  const title = row.title?.trim() || "your application";

  return {
    title: `Still waiting on ${title}?`,
    body:
      `It's been ${weeks} weeks with no reply — that usually means they moved on, ` +
      `and it says nothing about you. Close it out and free the space; ` +
      `your next best shot is ready.`,
    kind: "deadline-reminder",
    severity: "info",
    scheduledFor: new Date(now.getTime() + SCHEDULE_DELAY_MS).toISOString(),
    dedupeKey: `ghost:${row.application_id}`,
    metadata: {
      applicationId: row.application_id,
      // Mobile deep-link contract (app/(app)/_layout.tsx): metadata.url starting
      // with "/" is pushed as an in-app route. Land the user on the applied
      // screen where they can close the application out.
      url: "/applied",
      androidChannelId: "deadlines",
      weeksSilent: weeks,
      source: "ghost-closure",
    },
  };
}

/**
 * Ghost-closure nudges for long-silent submitted applications.
 *
 * A user who submitted and never heard back is left in limbo — the app has no
 * way to tell them "that's on them, not you". This daily job finds every
 * `submitted` application that has sat silent past the threshold (~45 days) and
 * schedules a single supportive push inviting the user to close it out and move
 * to their next best shot.
 *
 * One push per application, ever: the candidate SQL excludes any application
 * that already has a `ghost:<id>` notification row (written by deliverBroadcast
 * on delivery), and replaceScheduledUserNotifications collapses the in-flight
 * pending window by dedupe prefix — so a second cron run never re-notifies.
 *
 * Ships dark: unlike the recs gates (default on), this cron runs only when
 * APPLICATION_GHOST_NUDGES_ENABLED === "true", so a standing backlog of stale
 * applications can't fire a nudge storm on deploy before copy and threshold are
 * validated.
 */
@Injectable()
export class ApplicationGhostClosureService {
  private readonly logger = new Logger(ApplicationGhostClosureService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async runScheduled() {
    if (process.env.APPLICATION_GHOST_NUDGES_ENABLED !== "true") return;
    try {
      const result = await this.nudgeGhostedApplications();
      if (result.nudged > 0) {
        this.logger.log(
          `Ghost-closure nudges: ${result.nudged} scheduled across ${result.candidates} long-silent applications`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Ghost-closure nudge run failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async nudgeGhostedApplications(limit = 2000) {
    const thresholdDays = ghostThresholdDays();
    const candidates = await this.getCandidates(thresholdDays, limit);
    if (!candidates.length) return { candidates: 0, nudged: 0 };

    const now = new Date();
    let nudged = 0;
    for (const candidate of candidates) {
      const nudge = buildGhostNudge(candidate, { thresholdDays, now });
      if (!nudge) continue;
      try {
        const result =
          await this.notificationsService.replaceScheduledUserNotifications(
            candidate.user_id,
            `ghost:${candidate.application_id}`,
            [nudge],
          );
        nudged += result.scheduled;
      } catch (error) {
        this.logger.warn(
          `Could not schedule ghost-closure nudge for application ${candidate.application_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { candidates: candidates.length, nudged };
  }

  /**
   * Submitted applications past the silence threshold, joined to their
   * opportunity for the title. The interval is parameterized (bound int cast to
   * text) rather than string-interpolated, and the NOT EXISTS on a prior
   * `ghost:<id>` notification is what makes the job idempotent across days.
   */
  private async getCandidates(thresholdDays: number, limit: number) {
    const result = await db.execute(sql`
      select
        a.id as application_id,
        a.user_id::text as user_id,
        o.title as title,
        a.status as status,
        a.submitted_at as submitted_at
      from public.opportunity_applications a
      join public.opportunities o on o.id = a.opportunity_id
      where a.status = 'submitted'
        and a.submitted_at is not null
        and a.submitted_at < now() - ((${thresholdDays})::text || ' days')::interval
        and not exists (
          select 1 from public.notifications n
          where n.dedupe_key = 'ghost:' || a.id::text
        )
      limit ${limit}
    `);
    return this.rows<GhostApplicationRow>(result);
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
