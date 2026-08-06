import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { NotificationsService } from "./notifications.service";
import type { BroadcastNotificationDto } from "./dto/notification.dto";

type ReminderCandidate = {
  user_id: string;
  opportunity_id: string;
  title: string | null;
  deadline: string;
};

type KitRow = {
  user_id: string;
  opportunity_id: string;
  kit: Record<string, unknown> | null;
  checklist_state: Record<string, unknown> | null;
};

type DocGapRow = {
  user_id: string;
  opportunity_id: string;
  cv_missing: boolean;
  sop_missing: boolean;
};

type ReminderPlan = {
  candidate: ReminderCandidate;
  reminders: BroadcastNotificationDto[];
};

const REMINDER_OFFSETS = [14, 7, 3, 1, 0];

/** More than this many reminders on one day for one user reads as spam. */
const MAX_REMINDERS_PER_DAY = 3;

/**
 * Dedupe prefix for the collapsed summary. Deliberately distinct from the
 * per-opportunity `opp-deadline:<id>` prefix so `replaceScheduledUserNotifications`
 * can rewrite a user's summaries as one unit without touching (or being
 * clobbered by) the per-opportunity series.
 */
const SUMMARY_PREFIX = "opp-deadline-summary";

/**
 * The single authority for opportunity deadline reminders.
 *
 * Goal/roadmap reminders only exist when the user explicitly created a goal
 * or adopted a roadmap — merely saving an opportunity produced no reminders
 * at all, which is exactly how deadlines get missed. This job closes that
 * gap: every saved/tracked opportunity with an upcoming deadline gets a
 * scheduled reminder series, and each reminder carries the user's next
 * action (a missing required document, else their next unchecked
 * application-kit item) so the ping is an action, not a countdown.
 *
 * It replaced the same-day deadline cron that used to live in
 * `OpportunityAlertsService`: three separate jobs were sending
 * `kind: "deadline-reminder"` about the same opportunity with three different
 * dedupe keys, so nothing caught the duplication. This service wins because it
 * has the widest candidate source (both bookmark tables ∪ live applications),
 * the fullest offset ladder (14/7/3/1/0), pre-schedules rather than firing
 * same-day, and already carries a next action. The old service's
 * "collapse into one summary when more than three land at once" behaviour was
 * carried over here — see `collapseCrowdedDays`.
 */
@Injectable()
export class OpportunityDeadlineRemindersService {
  private readonly logger = new Logger(
    OpportunityDeadlineRemindersService.name,
  );

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runScheduled() {
    if (process.env.OPPORTUNITY_DEADLINE_REMINDERS_ENABLED === "false") return;
    try {
      const result = await this.scheduleUpcoming();
      if (result.pairs > 0) {
        this.logger.log(
          `Opportunity deadline reminders: ${result.scheduled} scheduled across ${result.pairs} saved/tracked items (${result.collapsed} crowded days collapsed)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Opportunity deadline reminder run failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async scheduleUpcoming(limit = 2000) {
    const candidates = await this.getCandidates(limit);
    if (!candidates.length) return { pairs: 0, scheduled: 0, collapsed: 0 };

    const nextActions = await this.loadNextActions(candidates);

    const byUser = new Map<string, ReminderCandidate[]>();
    for (const candidate of candidates) {
      const list = byUser.get(candidate.user_id) ?? [];
      list.push(candidate);
      byUser.set(candidate.user_id, list);
    }

    let scheduled = 0;
    let collapsed = 0;

    for (const [userId, userCandidates] of byUser) {
      const plans: ReminderPlan[] = userCandidates.map((candidate) => ({
        candidate,
        reminders: this.buildReminders(
          candidate,
          nextActions.get(`${candidate.user_id}:${candidate.opportunity_id}`) ??
            null,
        ),
      }));

      const { perOpportunity, summaries } = this.collapseCrowdedDays(plans);

      for (const plan of perOpportunity) {
        try {
          const result =
            await this.notificationsService.replaceScheduledUserNotifications(
              userId,
              `opp-deadline:${plan.candidate.opportunity_id}`,
              plan.reminders,
            );
          scheduled += result.scheduled;
        } catch (error) {
          this.logger.warn(
            `Could not schedule deadline reminders for opportunity ${plan.candidate.opportunity_id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Always run, even with zero summaries: this call clears any summary
      // scheduled by a previous run whose crowded day has since thinned out.
      try {
        const result =
          await this.notificationsService.replaceScheduledUserNotifications(
            userId,
            SUMMARY_PREFIX,
            summaries,
          );
        scheduled += result.scheduled;
        collapsed += result.scheduled;
      } catch (error) {
        this.logger.warn(
          `Could not schedule collapsed deadline summary for user ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { pairs: candidates.length, scheduled, collapsed };
  }

  /**
   * Saved (both bookmark tables) and in-flight applications, joined to
   * active opportunities whose deadline lands within the next 30 days.
   * Terminal application states are excluded — a submitted or decided
   * application no longer needs "get it done" reminders.
   */
  private async getCandidates(limit: number) {
    const result = await db.execute(sql`
      select distinct
        tracked.user_id,
        opportunity.id as opportunity_id,
        opportunity.title,
        coalesce(opportunity.close_date, opportunity.deadline) as deadline
      from (
        select user_id, opportunity_id from public.opportunity_bookmarks
        union
        select user_id, opportunity_id from public.bookmarks
        union
        select user_id, opportunity_id
        from public.opportunity_applications
        where status not in ('submitted', 'offer', 'rejected', 'withdrawn', 'no_response')
      ) tracked
      join public.opportunities opportunity
        on opportunity.id = tracked.opportunity_id
      where opportunity.status = 'active'
        and coalesce(opportunity.close_date, opportunity.deadline)
          between now() and now() + interval '30 days'
      limit ${limit}
    `);
    return this.rows<ReminderCandidate>(result);
  }

  /**
   * The "one small thing to do today" for each (user, opportunity) pair.
   *
   * Two sources, in priority order:
   *  1. A missing required document (CV / SOP) on a live application. This is
   *     the hard blocker — no CV means no submission — and it is what the
   *     old standalone win-coach doc nudge used to push about separately.
   *     Folding it in here is what lets that job stop duplicating this one.
   *  2. The next unchecked application-kit checklist item.
   */
  private async loadNextActions(candidates: ReminderCandidate[]) {
    const map = new Map<string, string>();
    const opportunityIds = [
      ...new Set(candidates.map((candidate) => candidate.opportunity_id)),
    ];
    if (!opportunityIds.length) return map;

    // Lower priority first — the document gap below overwrites it.
    let kits: KitRow[] = [];
    try {
      const result = await db.execute(sql`
        select user_id::text as user_id, opportunity_id, kit, checklist_state
        from public.application_kits
        where opportunity_id = any(${opportunityIds}::uuid[])
      `);
      kits = this.rows<KitRow>(result);
    } catch (error) {
      this.logger.warn(
        `Could not load application kits for next actions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    for (const row of kits) {
      const checklist = Array.isArray(
        (row.kit as { checklist?: unknown })?.checklist,
      )
        ? ((row.kit as { checklist: unknown[] }).checklist as Array<
            Record<string, unknown>
          >)
        : [];
      const state = row.checklist_state ?? {};
      const next = checklist.find((item) => {
        const id = String(item.id ?? "");
        return id && !state[id];
      });
      const label =
        typeof next?.title === "string"
          ? next.title
          : typeof next?.label === "string"
            ? next.label
            : null;
      if (label) {
        map.set(`${row.user_id}:${row.opportunity_id}`, label);
      }
    }

    for (const row of await this.loadDocumentGaps(opportunityIds)) {
      const missing = [
        ...(row.cv_missing ? ["cv"] : []),
        ...(row.sop_missing ? ["sop"] : []),
      ];
      if (!missing.length) continue;
      map.set(
        `${row.user_id}:${row.opportunity_id}`,
        this.describeMissingDocs(missing),
      );
    }

    return map;
  }

  /**
   * Live applications still missing a required document. Mirrors the query the
   * win-coach doc nudge runs, minus the offset/ledger filtering — here it only
   * has to answer "what is this user's blocking gap right now".
   */
  private async loadDocumentGaps(
    opportunityIds: string[],
  ): Promise<DocGapRow[]> {
    try {
      const result = await db.execute(sql`
        select a.user_id::text as user_id,
               a.opportunity_id,
               not exists (
                 select 1 from public.application_documents d
                 where d.application_id = a.id
                   and d.role = 'cv'
                   and d.status <> 'missing'
               ) as cv_missing,
               not exists (
                 select 1 from public.application_documents d
                 where d.application_id = a.id
                   and d.role = 'sop'
                   and d.status <> 'missing'
               ) as sop_missing
        from public.opportunity_applications a
        where a.opportunity_id = any(${opportunityIds}::uuid[])
          and a.status not in ('submitted', 'offer', 'rejected', 'withdrawn')
      `);
      return this.rows<DocGapRow>(result);
    } catch (error) {
      this.logger.warn(
        `Could not load application document gaps: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /** Next-action phrasing for missing required documents (pure — unit tested). */
  private describeMissingDocs(missing: string[]): string {
    const parts = missing.map((role) =>
      role === "cv"
        ? "upload your CV"
        : role === "sop"
          ? "draft your statement of purpose"
          : `add your ${role}`,
    );
    const phrase = parts.join(" and ");
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  /**
   * Collapses any single day on which more than `MAX_REMINDERS_PER_DAY`
   * reminders would land for one user into a single summary push.
   *
   * The old same-day cron did this at send time; here reminders are
   * pre-scheduled per (user, opportunity), so the crowding has to be detected
   * across the user's whole plan and the offending entries removed from each
   * per-opportunity series before it is written.
   */
  private collapseCrowdedDays(plans: ReminderPlan[]): {
    perOpportunity: ReminderPlan[];
    summaries: BroadcastNotificationDto[];
  } {
    const byDate = new Map<
      string,
      Array<{
        candidate: ReminderCandidate;
        reminder: BroadcastNotificationDto;
      }>
    >();

    for (const plan of plans) {
      for (const reminder of plan.reminders) {
        const date = this.scheduledDate(reminder);
        if (!date) continue;
        const list = byDate.get(date) ?? [];
        list.push({ candidate: plan.candidate, reminder });
        byDate.set(date, list);
      }
    }

    const crowded = new Set(
      [...byDate.entries()]
        .filter(([, entries]) => entries.length > MAX_REMINDERS_PER_DAY)
        .map(([date]) => date),
    );

    if (!crowded.size) return { perOpportunity: plans, summaries: [] };

    const perOpportunity = plans.map((plan) => ({
      candidate: plan.candidate,
      reminders: plan.reminders.filter((reminder) => {
        const date = this.scheduledDate(reminder);
        return !date || !crowded.has(date);
      }),
    }));

    const summaries = [...crowded]
      .sort()
      .map((date) => this.buildSummary(date, byDate.get(date) ?? []));

    return { perOpportunity, summaries };
  }

  private buildSummary(
    date: string,
    entries: Array<{
      candidate: ReminderCandidate;
      reminder: BroadcastNotificationDto;
    }>,
  ): BroadcastNotificationDto {
    const soonest = entries.reduce((a, b) =>
      this.daysBefore(a.reminder) <= this.daysBefore(b.reminder) ? a : b,
    );
    const soonestDays = this.daysBefore(soonest.reminder);
    const soonestTitle = soonest.candidate.title || "A saved opportunity";

    return {
      title: `⏰ ${entries.length} deadlines need you`,
      body: `${entries.length} of your saved opportunities close soon — the first is "${soonestTitle}" ${this.daysPhrase(soonestDays)}.`,
      kind: "deadline-reminder" as const,
      severity: soonestDays <= 1 ? "warning" : "info",
      // Every reminder for a day is stamped 09:00 UTC, so any entry's time
      // is the day's time.
      scheduledFor: soonest.reminder.scheduledFor,
      // user_id is the other half of the unique index, so the date alone
      // makes this unique per user per day — and two runs on the same day
      // intentionally collide rather than double-push.
      dedupeKey: `${SUMMARY_PREFIX}:${date}`,
      metadata: {
        url: "/opportunities",
        androidChannelId: "deadlines",
        collapsedCount: entries.length,
        opportunityIds: [
          ...new Set(entries.map((entry) => entry.candidate.opportunity_id)),
        ],
        soonestDaysBefore: soonestDays,
        source: "opportunity-deadline-reminders",
      },
    };
  }

  private scheduledDate(reminder: BroadcastNotificationDto): string | null {
    return reminder.scheduledFor ? reminder.scheduledFor.slice(0, 10) : null;
  }

  private daysBefore(reminder: BroadcastNotificationDto): number {
    const value = (reminder.metadata as { daysBefore?: unknown } | undefined)
      ?.daysBefore;
    return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
  }

  private daysPhrase(days: number) {
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days} days`;
  }

  private buildReminders(
    candidate: ReminderCandidate,
    nextAction: string | null,
  ): BroadcastNotificationDto[] {
    const deadline = new Date(candidate.deadline);
    if (Number.isNaN(deadline.getTime())) return [];
    const title = candidate.title || "A saved opportunity";

    return REMINDER_OFFSETS.map((daysBefore) => {
      const scheduledFor = new Date(deadline);
      scheduledFor.setUTCDate(scheduledFor.getUTCDate() - daysBefore);
      scheduledFor.setUTCHours(9, 0, 0, 0);

      return {
        title:
          daysBefore === 0
            ? `Deadline today: ${title}`
            : `${daysBefore} day${daysBefore === 1 ? "" : "s"} left: ${title}`,
        body: this.reminderBody(daysBefore, nextAction),
        kind: "deadline-reminder" as const,
        severity: daysBefore <= 1 ? "warning" : "info",
        scheduledFor: scheduledFor.toISOString(),
        dedupeKey: `opp-deadline:${candidate.opportunity_id}:${daysBefore}`,
        metadata: {
          opportunityId: candidate.opportunity_id,
          deadline: deadline.toISOString(),
          daysBefore,
          nextAction,
          androidChannelId: "deadlines",
          source: "opportunity-deadline-reminders",
        },
      };
    });
  }

  /** A reminder should hand the user an action, not just a countdown. */
  private reminderBody(daysBefore: number, nextAction: string | null) {
    if (daysBefore === 0) {
      return nextAction
        ? `Last call — finish "${nextAction}" and submit before the portal closes.`
        : "Last call — submit before the portal closes. Don't leave it for 11:52pm.";
    }
    if (nextAction) {
      return `Next small move: ${nextAction}. Fifteen focused minutes today keeps you ahead.`;
    }
    return "Open your checklist and finish one item — fifteen minutes today beats a scramble later.";
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
