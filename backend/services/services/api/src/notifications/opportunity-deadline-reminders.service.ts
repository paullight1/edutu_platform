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

const REMINDER_OFFSETS = [14, 7, 3, 1, 0];

/**
 * Deadline reminders for opportunities the user saved or is applying to.
 *
 * Goal/roadmap reminders only exist when the user explicitly created a goal
 * or adopted a roadmap — merely saving an opportunity produced no reminders
 * at all, which is exactly how deadlines get missed. This job closes that
 * gap: every saved/tracked opportunity with an upcoming deadline gets a
 * scheduled reminder series, and each reminder carries the user's next
 * unchecked application-kit item so the ping is an action, not a countdown.
 */
@Injectable()
export class OpportunityDeadlineRemindersService {
  private readonly logger = new Logger(OpportunityDeadlineRemindersService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runScheduled() {
    if (process.env.OPPORTUNITY_DEADLINE_REMINDERS_ENABLED === "false") return;
    try {
      const result = await this.scheduleUpcoming();
      if (result.pairs > 0) {
        this.logger.log(
          `Opportunity deadline reminders: ${result.scheduled} scheduled across ${result.pairs} saved/tracked items`,
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
    if (!candidates.length) return { pairs: 0, scheduled: 0 };

    const nextActions = await this.loadNextActions(candidates);

    let scheduled = 0;
    for (const candidate of candidates) {
      const nextAction =
        nextActions.get(`${candidate.user_id}:${candidate.opportunity_id}`) ??
        null;
      try {
        const result =
          await this.notificationsService.replaceScheduledUserNotifications(
            candidate.user_id,
            `opp-deadline:${candidate.opportunity_id}`,
            this.buildReminders(candidate, nextAction),
          );
        scheduled += result.scheduled;
      } catch (error) {
        this.logger.warn(
          `Could not schedule deadline reminders for opportunity ${candidate.opportunity_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { pairs: candidates.length, scheduled };
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
        where status not in ('submitted', 'offer', 'rejected', 'withdrawn')
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
   * The user's next unchecked application-kit checklist item for each
   * (user, opportunity) pair — the "one small thing to do today".
   */
  private async loadNextActions(candidates: ReminderCandidate[]) {
    const map = new Map<string, string>();
    const opportunityIds = [
      ...new Set(candidates.map((candidate) => candidate.opportunity_id)),
    ];
    if (!opportunityIds.length) return map;

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
      return map;
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
    return map;
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
        severity: (daysBefore <= 1 ? "warning" : "info") as
          | "warning"
          | "info",
        scheduledFor: scheduledFor.toISOString(),
        dedupeKey: `opp-deadline:${candidate.opportunity_id}:${daysBefore}`,
        metadata: {
          opportunityId: candidate.opportunity_id,
          deadline: deadline.toISOString(),
          daysBefore,
          nextAction,
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
