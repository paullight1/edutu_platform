import { Injectable } from "@nestjs/common";
import { and, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { opportunityJourneyEvents } from "../db/opportunity-journey.schema";

export interface OpportunityPipelineEventRow {
  userId: string;
  journeyId: string | null;
  opportunityId: string | null;
  eventType: string;
  source: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface OpportunityPipelineAnalyticsSource {
  listEvents(input: {
    from: Date;
    to: Date;
  }): Promise<OpportunityPipelineEventRow[]>;
}

export const OPPORTUNITY_PIPELINE_FUNNEL_STEPS = [
  "intent_available",
  "focused_shortlist_viewed",
  "decision_recorded",
  "journey_activated",
  "first_task_completed",
  "ready_to_apply",
  "application_opened",
  "application_confirmed",
  "interview_recorded",
  "offer_recorded",
] as const;

export type OpportunityPipelineFunnelStep =
  (typeof OPPORTUNITY_PIPELINE_FUNNEL_STEPS)[number];

const EVENT_STEP: Record<string, OpportunityPipelineFunnelStep | null> = {
  intent_created: "intent_available",
  intent_updated: "intent_available",
  focused_shortlist_generated: "focused_shortlist_viewed",
  focused_shortlist_viewed: "focused_shortlist_viewed",
  recommendation_passed: "decision_recorded",
  journey_shortlisted: "decision_recorded",
  journey_activated: "journey_activated",
  task_completed: "first_task_completed",
  journey_ready_to_apply: "ready_to_apply",
  application_opened: "application_opened",
  application_confirmed: "application_confirmed",
  journey_interview: "interview_recorded",
  interview_recorded: "interview_recorded",
  journey_outcome: null,
};

function eventStep(event: OpportunityPipelineEventRow): OpportunityPipelineFunnelStep | null {
  if (event.eventType === "journey_outcome") {
    return event.metadata?.outcome === "offer" ? "offer_recorded" : null;
  }
  return EVENT_STEP[event.eventType] ?? null;
}

function distinctUsers(events: OpportunityPipelineEventRow[]): number {
  return new Set(events.map((event) => event.userId)).size;
}

function sourceCounts(events: OpportunityPipelineEventRow[]) {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.source] = (counts[event.source] ?? 0) + 1;
  return counts;
}

export function summarizeOpportunityPipelineEvents(
  events: OpportunityPipelineEventRow[],
  from: Date,
  to: Date,
) {
  const inWindow = events.filter(
    (event) => event.createdAt >= from && event.createdAt <= to,
  );
  const grouped = Object.fromEntries(
    OPPORTUNITY_PIPELINE_FUNNEL_STEPS.map((step) => [step, [] as OpportunityPipelineEventRow[]]),
  ) as Record<OpportunityPipelineFunnelStep, OpportunityPipelineEventRow[]>;

  for (const event of inWindow) {
    const step = eventStep(event);
    if (step) grouped[step].push(event);
  }

  const activatedByJourney = new Map<string, OpportunityPipelineEventRow>();
  for (const event of grouped.journey_activated) {
    if (event.journeyId) activatedByJourney.set(event.journeyId, event);
  }
  const northStarUsers = new Set<string>();
  for (const completion of grouped.first_task_completed) {
    if (!completion.journeyId) continue;
    const activation = activatedByJourney.get(completion.journeyId);
    if (!activation) continue;
    const elapsed = completion.createdAt.getTime() - activation.createdAt.getTime();
    if (elapsed >= 0 && elapsed <= 7 * 24 * 60 * 60 * 1_000) {
      northStarUsers.add(completion.userId);
    }
  }
  const activatedUsers = distinctUsers(grouped.journey_activated);

  const funnel = OPPORTUNITY_PIPELINE_FUNNEL_STEPS.map((step, index) => {
    const users = distinctUsers(grouped[step]);
    const previousUsers =
      index === 0 ? users : distinctUsers(grouped[OPPORTUNITY_PIPELINE_FUNNEL_STEPS[index - 1]]);
    return {
      step,
      users,
      events: grouped[step].length,
      conversionFromPrevious:
        previousUsers > 0 ? Math.round((users / previousUsers) * 10_000) / 100 : 0,
    };
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    activeUsers: distinctUsers(inWindow),
    northStar: {
      eligibleUsers: activatedUsers,
      successfulUsers: northStarUsers.size,
      percentage:
        activatedUsers > 0
          ? Math.round((northStarUsers.size / activatedUsers) * 10_000) / 100
          : 0,
    },
    funnel,
    guardrails: {
      applicationOpenedUsers: distinctUsers(grouped.application_opened),
      applicationConfirmedUsers: distinctUsers(grouped.application_confirmed),
      openedWithoutConfirmationGap: Math.max(
        0,
        distinctUsers(grouped.application_opened) -
          distinctUsers(grouped.application_confirmed),
      ),
      reminderEvents: inWindow.filter(
        (event) => event.eventType === "journey_reminder_queued",
      ).length,
      sourceCounts: sourceCounts(inWindow),
    },
  };
}

@Injectable()
export class DatabaseOpportunityPipelineAnalyticsSource
  implements OpportunityPipelineAnalyticsSource
{
  constructor(private readonly database: any = db) {}

  async listEvents(input: { from: Date; to: Date }) {
    return this.database
      .select({
        userId: opportunityJourneyEvents.userId,
        journeyId: opportunityJourneyEvents.journeyId,
        opportunityId: opportunityJourneyEvents.opportunityId,
        eventType: opportunityJourneyEvents.eventType,
        source: opportunityJourneyEvents.source,
        metadata: opportunityJourneyEvents.metadata,
        createdAt: opportunityJourneyEvents.createdAt,
      })
      .from(opportunityJourneyEvents)
      .where(
        and(
          gte(opportunityJourneyEvents.createdAt, input.from),
          lte(opportunityJourneyEvents.createdAt, input.to),
        ),
      )
      .execute();
  }
}

@Injectable()
export class OpportunityPipelineAnalyticsService {
  constructor(
    private readonly source: OpportunityPipelineAnalyticsSource =
      new DatabaseOpportunityPipelineAnalyticsSource(),
  ) {}

  async getSummary(input: { from: Date; to: Date }) {
    const events = await this.source.listEvents(input);
    return summarizeOpportunityPipelineEvents(events, input.from, input.to);
  }
}
