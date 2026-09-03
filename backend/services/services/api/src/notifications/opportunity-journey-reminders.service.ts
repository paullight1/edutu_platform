import { Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  notificationPreferences,
  notificationQueue,
  profiles,
} from "../db/schema";
import {
  opportunityJourneyEvents,
  opportunityJourneyTasks,
  userOpportunityJourneys,
} from "../db/opportunity-journey.schema";

export type OpportunityJourneyReminderKind =
  | "journey_task_72h"
  | "journey_task_24h"
  | "journey_task_overdue"
  | "journey_application_unconfirmed";

export interface OpportunityJourneyReminderRow {
  userId: string;
  journeyId: string;
  opportunityId: string;
  taskId: string | null;
  taskTitle: string | null;
  taskDueAt: Date | null;
  state: string;
  applyLinkOpenedAt: Date | null;
  timezone: string | null;
  quietHours: { start?: string; end?: string } | null;
  deadlineReminders: boolean | null;
  opportunityAlerts: boolean | null;
}

export interface OpportunityJourneyReminderCandidate {
  userId: string;
  journeyId: string;
  opportunityId: string;
  taskId: string | null;
  kind: OpportunityJourneyReminderKind;
  title: string;
  body: string;
  scheduledFor: Date;
  dedupeKey: string;
}

export interface OpportunityJourneyReminderSource {
  listReminderRows(now: Date): Promise<OpportunityJourneyReminderRow[]>;
  queueCandidate(candidate: OpportunityJourneyReminderCandidate): Promise<boolean>;
}

function parseClock(value: string | undefined, fallback: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value ?? fallback);
  if (!match) return parseClock(fallback, "22:00");
  return [Math.min(23, Number(match[1])), Math.min(59, Number(match[2]))];
}

function localParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function isInsideQuietHours(
  hour: number,
  minute: number,
  start: [number, number],
  end: [number, number],
): boolean {
  const current = hour * 60 + minute;
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  return startMinutes <= endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

export function nextOpportunityReminderDeliveryAt(
  now: Date,
  timezone = "Africa/Lagos",
  quietHours: { start?: string; end?: string } | null = null,
): Date {
  const safeTimezone = timezone || "Africa/Lagos";
  let parts: ReturnType<typeof localParts>;
  try {
    parts = localParts(now, safeTimezone);
  } catch {
    return now;
  }
  const start = parseClock(quietHours?.start, "22:00");
  const end = parseClock(quietHours?.end, "08:00");
  if (!isInsideQuietHours(parts.hour, parts.minute, start, end)) return now;

  const currentMinutes = parts.hour * 60 + parts.minute;
  const endMinutes = end[0] * 60 + end[1];
  const minutesUntilEnd =
    currentMinutes < endMinutes
      ? endMinutes - currentMinutes
      : 24 * 60 - currentMinutes + endMinutes;
  return new Date(now.getTime() + Math.max(1, minutesUntilEnd) * 60_000);
}

export function selectOpportunityJourneyReminder(
  row: OpportunityJourneyReminderRow,
  now: Date,
): OpportunityJourneyReminderCandidate | null {
  if (["applied", "interview", "offer", "rejected", "withdrawn", "no_response", "expired", "archived"].includes(row.state)) {
    return null;
  }

  let kind: OpportunityJourneyReminderKind | null = null;
  let title = "Your next Edutu action";
  let body = "Continue your opportunity preparation.";
  let taskId: string | null = row.taskId;

  if (
    row.state === "application_opened" &&
    row.applyLinkOpenedAt &&
    now.getTime() - row.applyLinkOpenedAt.getTime() >= 24 * 60 * 60 * 1_000
  ) {
    kind = "journey_application_unconfirmed";
    title = "Did you submit your application?";
    body = "Confirm your application status so Edutu can guide the next step.";
    taskId = null;
  } else if (row.taskDueAt && row.taskTitle && row.deadlineReminders !== false) {
    const hours = (row.taskDueAt.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0) {
      kind = "journey_task_overdue";
      title = "Your next action is overdue";
      body = row.taskTitle;
    } else if (hours <= 24) {
      kind = "journey_task_24h";
      title = "Your next action is due soon";
      body = row.taskTitle;
    } else if (hours <= 72) {
      kind = "journey_task_72h";
      title = "Plan your next opportunity action";
      body = row.taskTitle;
    }
  }

  if (!kind || row.opportunityAlerts === false) return null;
  const entity = taskId ?? row.journeyId;
  return {
    userId: row.userId,
    journeyId: row.journeyId,
    opportunityId: row.opportunityId,
    taskId,
    kind,
    title,
    body,
    scheduledFor: nextOpportunityReminderDeliveryAt(
      now,
      row.timezone ?? "Africa/Lagos",
      row.quietHours,
    ),
    dedupeKey: `opportunity-journey-reminder:${kind}:${entity}`,
  };
}

@Injectable()
export class DatabaseOpportunityJourneyReminderSource
  implements OpportunityJourneyReminderSource
{
  constructor(private readonly database: any = db) {}

  async listReminderRows(_now: Date): Promise<OpportunityJourneyReminderRow[]> {
    const result = await this.database.execute(sql`
      with ranked_tasks as (
        select
          task.*,
          row_number() over (
            partition by task.journey_id
            order by task.due_at asc nulls last, task.position asc
          ) as task_rank
        from public.opportunity_journey_tasks task
        where task.required = true
          and task.status not in ('completed', 'skipped')
      )
      select
        journey.user_id::text as "userId",
        journey.id::text as "journeyId",
        journey.opportunity_id::text as "opportunityId",
        task.id::text as "taskId",
        task.title as "taskTitle",
        task.due_at as "taskDueAt",
        journey.state,
        journey.apply_link_opened_at as "applyLinkOpenedAt",
        profile.timezone,
        preference.quiet_hours as "quietHours",
        preference.deadline_reminders as "deadlineReminders",
        preference.opportunity_alerts as "opportunityAlerts"
      from public.user_opportunity_journeys journey
      left join ranked_tasks task
        on task.journey_id = journey.id and task.task_rank = 1
      left join public.profiles profile
        on profile.user_id = journey.user_id
      left join public.notification_preferences preference
        on preference.user_id = journey.user_id
      where journey.state in (
        'pursuing',
        'preparing',
        'ready_to_apply',
        'application_opened'
      )
    `);
    return Array.isArray(result)
      ? (result as OpportunityJourneyReminderRow[])
      : ((result as { rows?: OpportunityJourneyReminderRow[] }).rows ?? []);
  }

  async queueCandidate(
    candidate: OpportunityJourneyReminderCandidate,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction: any) => {
      const inserted = await transaction
        .insert(opportunityJourneyEvents)
        .values({
          userId: candidate.userId,
          journeyId: candidate.journeyId,
          opportunityId: candidate.opportunityId,
          eventType: "journey_reminder_queued",
          source: "backend",
          idempotencyKey: candidate.dedupeKey,
          metadata: {
            kind: candidate.kind,
            taskId: candidate.taskId,
            scheduledFor: candidate.scheduledFor.toISOString(),
          },
        })
        .onConflictDoNothing({
          target: [
            opportunityJourneyEvents.userId,
            opportunityJourneyEvents.idempotencyKey,
          ],
        })
        .returning({ id: opportunityJourneyEvents.id })
        .execute();
      if (inserted.length === 0) return false;

      await transaction
        .insert(notificationQueue)
        .values({
          payload: {
            userId: candidate.userId,
            kind: candidate.kind,
            title: candidate.title,
            body: candidate.body,
            severity: "info",
            dedupeKey: candidate.dedupeKey,
            metadata: {
              journeyId: candidate.journeyId,
              opportunityId: candidate.opportunityId,
              taskId: candidate.taskId,
              deepLink: `/my-path?journey=${candidate.journeyId}`,
            },
          },
          scheduledFor: candidate.scheduledFor,
          status: "pending",
        })
        .execute();
      return true;
    });
  }
}

@Injectable()
export class OpportunityJourneyRemindersService {
  constructor(
    private readonly source: OpportunityJourneyReminderSource =
      new DatabaseOpportunityJourneyReminderSource(),
  ) {}

  async enqueueDue(now = new Date()): Promise<{
    considered: number;
    queued: number;
    deduplicated: number;
  }> {
    const rows = await this.source.listReminderRows(now);
    let queued = 0;
    let deduplicated = 0;
    for (const row of rows) {
      const candidate = selectOpportunityJourneyReminder(row, now);
      if (!candidate) continue;
      if (await this.source.queueCandidate(candidate)) queued += 1;
      else deduplicated += 1;
    }
    return { considered: rows.length, queued, deduplicated };
  }
}
