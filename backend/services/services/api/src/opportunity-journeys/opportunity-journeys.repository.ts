import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  opportunityIntents,
  opportunityJourneyEvents,
  opportunityJourneyTasks,
  userOpportunityJourneys,
  type NewOpportunityIntent,
  type NewOpportunityJourneyTask,
  type OpportunityIntent,
  type OpportunityJourney,
  type OpportunityJourneyEvent,
  type OpportunityJourneyTask,
} from "../db/opportunity-journey.schema";
import { opportunities } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import type {
  OpportunityJourneyState,
  OpportunityPublicStage,
} from "./opportunity-journey.types";
import {
  eventMetadataWithMutationHash,
  hashOpportunityJourneyMutation,
  readMutationHash,
  type OpportunityJourneyEventInput,
} from "./opportunity-journey-event";

export type OpportunityJourneyPriority = "primary" | "secondary" | "none";

export interface CreateOrReadJourneyInput extends OpportunityJourneyEventInput {
  userId: string;
  opportunityId: string;
  intentId?: string | null;
  state: OpportunityJourneyState;
  priority?: OpportunityJourneyPriority;
  eligibilityStatus?: "eligible" | "likely" | "unclear" | "ineligible";
  eligibilityConfidence?: number;
  eligibilityReasons?: unknown[];
  eligibilityBlockers?: unknown[];
  matchScoreSnapshot?: number | null;
  matchReasonsSnapshot?: unknown[];
  matchRisksSnapshot?: unknown[];
  estimatedEffortHours?: number | null;
  nextActionAt?: Date | null;
  committedAt?: Date | null;
}

export type OpportunityJourneyPatch = Partial<
  Pick<
    OpportunityJourney,
    | "state"
    | "priority"
    | "eligibilityStatus"
    | "eligibilityConfidence"
    | "eligibilityReasons"
    | "eligibilityBlockers"
    | "matchScoreSnapshot"
    | "matchReasonsSnapshot"
    | "matchRisksSnapshot"
    | "estimatedEffortHours"
    | "nextActionAt"
    | "committedAt"
    | "applyLinkOpenedAt"
    | "appliedAt"
    | "closedAt"
    | "outcome"
    | "metadata"
  >
>;

export interface UpdateJourneyVersionedInput extends OpportunityJourneyEventInput {
  userId: string;
  journeyId: string;
  expectedVersion: number;
  patch: OpportunityJourneyPatch;
}

export type ReplaceActiveIntentEvent = OpportunityJourneyEventInput;

export type ReplaceActiveIntentInput = Omit<
  NewOpportunityIntent,
  "id" | "userId" | "status" | "createdAt" | "updatedAt" | "archivedAt"
>;

export interface JourneyWithDeadline extends OpportunityJourney {
  opportunityDeadline: Date | null;
}

export type OpportunityJourneyRepositoryErrorCode =
  | "IDEMPOTENCY_CONFLICT"
  | "JOURNEY_VERSION_CONFLICT"
  | "JOURNEY_NOT_FOUND"
  | "INVALID_USER_ID";

export class OpportunityJourneyRepositoryError extends Error {
  constructor(
    public readonly code: OpportunityJourneyRepositoryErrorCode,
    message: string,
    public readonly currentJourney: OpportunityJourney | null = null,
  ) {
    super(message);
    this.name = "OpportunityJourneyRepositoryError";
  }
}

const ACTIVE_STATES: OpportunityJourneyState[] = [
  "pursuing",
  "preparing",
  "ready_to_apply",
  "application_opened",
];

const STAGE_STATES: Record<OpportunityPublicStage, OpportunityJourneyState[]> =
  {
    discover: ["shortlisted"],
    pursuing: ACTIVE_STATES,
    applied: ["applied", "interview"],
    outcome: [
      "offer",
      "rejected",
      "withdrawn",
      "no_response",
      "expired",
      "archived",
    ],
  };

function databaseUserId(userId: string): string {
  const converted = toDatabaseUserId(userId);
  if (!converted) {
    throw new OpportunityJourneyRepositoryError(
      "INVALID_USER_ID",
      "A user id is required for opportunity journey persistence.",
    );
  }
  return converted;
}

function numericValue(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function eventMutationDescriptor(
  input:
    | CreateOrReadJourneyInput
    | UpdateJourneyVersionedInput
    | {
        userId: string;
        intent: ReplaceActiveIntentInput;
        event: ReplaceActiveIntentEvent;
      },
): unknown {
  if ("intent" in input) {
    return {
      userId: databaseUserId(input.userId),
      intent: input.intent,
      eventType: input.event.eventType,
      source: input.event.source,
      metadata: input.event.metadata ?? {},
    };
  }

  if ("journeyId" in input) {
    return {
      userId: databaseUserId(input.userId),
      journeyId: input.journeyId,
      expectedVersion: input.expectedVersion,
      patch: input.patch,
      eventType: input.eventType,
      source: input.source,
      metadata: input.metadata ?? {},
    };
  }

  return {
    userId: databaseUserId(input.userId),
    opportunityId: input.opportunityId,
    intentId: input.intentId ?? null,
    state: input.state,
    priority: input.priority ?? "none",
    eligibilityStatus: input.eligibilityStatus ?? "unclear",
    eligibilityConfidence: input.eligibilityConfidence ?? 0,
    eligibilityReasons: input.eligibilityReasons ?? [],
    eligibilityBlockers: input.eligibilityBlockers ?? [],
    matchScoreSnapshot: input.matchScoreSnapshot ?? null,
    matchReasonsSnapshot: input.matchReasonsSnapshot ?? [],
    matchRisksSnapshot: input.matchRisksSnapshot ?? [],
    estimatedEffortHours: input.estimatedEffortHours ?? null,
    nextActionAt: input.nextActionAt ?? null,
    committedAt: input.committedAt ?? null,
    eventType: input.eventType,
    source: input.source,
    metadata: input.metadata ?? {},
  };
}

export class OpportunityJourneysRepository {
  constructor(private readonly database: any = db) {}

  private async findEvent(
    executor: any,
    userId: string,
    idempotencyKey: string,
  ): Promise<OpportunityJourneyEvent | null> {
    const [event] = await executor
      .select()
      .from(opportunityJourneyEvents)
      .where(
        and(
          eq(opportunityJourneyEvents.userId, userId),
          eq(opportunityJourneyEvents.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
      .execute();
    return event ?? null;
  }

  private assertIdempotency(
    event: OpportunityJourneyEvent,
    mutation: unknown,
  ): void {
    const expected = hashOpportunityJourneyMutation(mutation);
    if (readMutationHash(event.metadata) !== expected) {
      throw new OpportunityJourneyRepositoryError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with a different mutation.",
      );
    }
  }

  private async insertEvent(
    executor: any,
    input: {
      userId: string;
      journeyId?: string | null;
      intentId?: string | null;
      opportunityId?: string | null;
      event: OpportunityJourneyEventInput;
      mutation: unknown;
    },
  ): Promise<void> {
    await executor
      .insert(opportunityJourneyEvents)
      .values({
        userId: input.userId,
        journeyId: input.journeyId ?? null,
        intentId: input.intentId ?? null,
        opportunityId: input.opportunityId ?? null,
        eventType: input.event.eventType,
        source: input.event.source,
        idempotencyKey: input.event.idempotencyKey,
        metadata: eventMetadataWithMutationHash(
          input.event.metadata,
          input.mutation,
        ),
      })
      .execute();
  }

  async getActiveIntent(userId: string): Promise<OpportunityIntent | null> {
    const convertedUserId = databaseUserId(userId);
    const [intent] = await this.database
      .select()
      .from(opportunityIntents)
      .where(
        and(
          eq(opportunityIntents.userId, convertedUserId),
          eq(opportunityIntents.status, "active"),
        ),
      )
      .limit(1)
      .execute();
    return intent ?? null;
  }

  async replaceActiveIntent(
    userId: string,
    intent: ReplaceActiveIntentInput,
    event: ReplaceActiveIntentEvent,
  ): Promise<OpportunityIntent> {
    const convertedUserId = databaseUserId(userId);
    const mutation = eventMutationDescriptor({ userId, intent, event });

    return this.database.transaction(async (transaction: any) => {
      const existingEvent = await this.findEvent(
        transaction,
        convertedUserId,
        event.idempotencyKey,
      );
      if (existingEvent) {
        this.assertIdempotency(existingEvent, mutation);
        const current = await this.getActiveIntent(userId);
        if (!current) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The idempotent intent result no longer exists.",
          );
        }
        return current;
      }

      await transaction
        .update(opportunityIntents)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(opportunityIntents.userId, convertedUserId),
            eq(opportunityIntents.status, "active"),
          ),
        )
        .execute();

      const [created] = await transaction
        .insert(opportunityIntents)
        .values({
          ...intent,
          userId: convertedUserId,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .execute();

      await this.insertEvent(transaction, {
        userId: convertedUserId,
        intentId: created.id,
        event,
        mutation,
      });

      return created;
    });
  }

  async createOrReadJourney(
    input: CreateOrReadJourneyInput,
  ): Promise<OpportunityJourney> {
    const convertedUserId = databaseUserId(input.userId);
    const mutation = eventMutationDescriptor(input);

    return this.database.transaction(async (transaction: any) => {
      const existingEvent = await this.findEvent(
        transaction,
        convertedUserId,
        input.idempotencyKey,
      );
      if (existingEvent) {
        this.assertIdempotency(existingEvent, mutation);
        if (!existingEvent.journeyId) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The idempotent event is not linked to a journey.",
          );
        }
        const [journey] = await transaction
          .select()
          .from(userOpportunityJourneys)
          .where(
            and(
              eq(userOpportunityJourneys.id, existingEvent.journeyId),
              eq(userOpportunityJourneys.userId, convertedUserId),
            ),
          )
          .limit(1)
          .execute();
        if (!journey) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The idempotent journey result no longer exists.",
          );
        }
        return journey;
      }

      const [inserted] = await transaction
        .insert(userOpportunityJourneys)
        .values({
          userId: convertedUserId,
          opportunityId: input.opportunityId,
          intentId: input.intentId ?? null,
          state: input.state,
          priority: input.priority ?? "none",
          eligibilityStatus: input.eligibilityStatus ?? "unclear",
          eligibilityConfidence: numericValue(
            input.eligibilityConfidence ?? 0,
          ) as string,
          eligibilityReasons: input.eligibilityReasons ?? [],
          eligibilityBlockers: input.eligibilityBlockers ?? [],
          matchScoreSnapshot: input.matchScoreSnapshot ?? null,
          matchReasonsSnapshot: input.matchReasonsSnapshot ?? [],
          matchRisksSnapshot: input.matchRisksSnapshot ?? [],
          estimatedEffortHours: numericValue(input.estimatedEffortHours),
          nextActionAt: input.nextActionAt ?? null,
          committedAt: input.committedAt ?? null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            userOpportunityJourneys.userId,
            userOpportunityJourneys.opportunityId,
          ],
        })
        .returning()
        .execute();

      const journey =
        inserted ??
        (
          await transaction
            .select()
            .from(userOpportunityJourneys)
            .where(
              and(
                eq(userOpportunityJourneys.userId, convertedUserId),
                eq(userOpportunityJourneys.opportunityId, input.opportunityId),
              ),
            )
            .limit(1)
            .execute()
        )[0];

      if (!journey) {
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_NOT_FOUND",
          "The journey could not be created or recovered.",
        );
      }

      await this.insertEvent(transaction, {
        userId: convertedUserId,
        journeyId: journey.id,
        intentId: journey.intentId,
        opportunityId: journey.opportunityId,
        event: input,
        mutation,
      });

      return journey;
    });
  }

  async updateJourneyVersioned(
    input: UpdateJourneyVersionedInput,
  ): Promise<OpportunityJourney> {
    const convertedUserId = databaseUserId(input.userId);
    const mutation = eventMutationDescriptor(input);

    return this.database.transaction(async (transaction: any) => {
      const existingEvent = await this.findEvent(
        transaction,
        convertedUserId,
        input.idempotencyKey,
      );
      if (existingEvent) {
        this.assertIdempotency(existingEvent, mutation);
        const current = await this.findJourneyForUser(
          input.userId,
          input.journeyId,
          transaction,
        );
        if (!current) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The idempotent journey result no longer exists.",
          );
        }
        return current;
      }

      const updateValues: Record<string, unknown> = {
        ...input.patch,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      };
      if (input.patch.eligibilityConfidence !== undefined) {
        updateValues.eligibilityConfidence = numericValue(
          Number(input.patch.eligibilityConfidence),
        );
      }
      if (input.patch.estimatedEffortHours !== undefined) {
        updateValues.estimatedEffortHours = numericValue(
          input.patch.estimatedEffortHours === null
            ? null
            : Number(input.patch.estimatedEffortHours),
        );
      }

      const [updated] = await transaction
        .update(userOpportunityJourneys)
        .set(updateValues)
        .where(
          and(
            eq(userOpportunityJourneys.id, input.journeyId),
            eq(userOpportunityJourneys.userId, convertedUserId),
            eq(userOpportunityJourneys.version, input.expectedVersion),
          ),
        )
        .returning()
        .execute();

      if (!updated) {
        const current = await this.findJourneyForUser(
          input.userId,
          input.journeyId,
          transaction,
        );
        if (!current) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The journey does not exist for this user.",
          );
        }
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_VERSION_CONFLICT",
          "The journey was changed by another client.",
          current,
        );
      }

      await this.insertEvent(transaction, {
        userId: convertedUserId,
        journeyId: updated.id,
        intentId: updated.intentId,
        opportunityId: updated.opportunityId,
        event: input,
        mutation,
      });

      return updated;
    });
  }

  async findJourneyForUser(
    userId: string,
    journeyId: string,
    executor: any = this.database,
  ): Promise<OpportunityJourney | null> {
    const convertedUserId = databaseUserId(userId);
    const [journey] = await executor
      .select()
      .from(userOpportunityJourneys)
      .where(
        and(
          eq(userOpportunityJourneys.id, journeyId),
          eq(userOpportunityJourneys.userId, convertedUserId),
        ),
      )
      .limit(1)
      .execute();
    return journey ?? null;
  }

  async findJourneyByOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<OpportunityJourney | null> {
    const convertedUserId = databaseUserId(userId);
    const [journey] = await this.database
      .select()
      .from(userOpportunityJourneys)
      .where(
        and(
          eq(userOpportunityJourneys.userId, convertedUserId),
          eq(userOpportunityJourneys.opportunityId, opportunityId),
        ),
      )
      .limit(1)
      .execute();
    return journey ?? null;
  }

  async listJourneysByStage(
    userId: string,
    stage: OpportunityPublicStage,
  ): Promise<JourneyWithDeadline[]> {
    const convertedUserId = databaseUserId(userId);
    const rows = await this.database
      .select({
        journey: userOpportunityJourneys,
        opportunityDeadline: opportunities.deadline,
      })
      .from(userOpportunityJourneys)
      .innerJoin(
        opportunities,
        eq(userOpportunityJourneys.opportunityId, opportunities.id),
      )
      .where(
        and(
          eq(userOpportunityJourneys.userId, convertedUserId),
          inArray(userOpportunityJourneys.state, STAGE_STATES[stage]),
        ),
      )
      .orderBy(
        asc(
          sql`coalesce(${userOpportunityJourneys.nextActionAt}, ${opportunities.deadline}, ${userOpportunityJourneys.updatedAt})`,
        ),
        asc(opportunities.deadline),
        asc(userOpportunityJourneys.updatedAt),
      )
      .execute();

    return rows.map((row: any) => ({
      ...row.journey,
      opportunityDeadline: row.opportunityDeadline ?? null,
    }));
  }

  async countActivePursuits(userId: string): Promise<number> {
    const convertedUserId = databaseUserId(userId);
    const rows = await this.database
      .select({ id: userOpportunityJourneys.id })
      .from(userOpportunityJourneys)
      .where(
        and(
          eq(userOpportunityJourneys.userId, convertedUserId),
          inArray(userOpportunityJourneys.state, ACTIVE_STATES),
        ),
      )
      .execute();
    return rows.length;
  }

  async listEventsForUser(userId: string): Promise<OpportunityJourneyEvent[]> {
    const convertedUserId = databaseUserId(userId);
    return this.database
      .select()
      .from(opportunityJourneyEvents)
      .where(eq(opportunityJourneyEvents.userId, convertedUserId))
      .orderBy(asc(opportunityJourneyEvents.createdAt))
      .execute();
  }

  async listTasksForJourney(
    userId: string,
    journeyId: string,
  ): Promise<OpportunityJourneyTask[]> {
    const journey = await this.findJourneyForUser(userId, journeyId);
    if (!journey) return [];
    return this.database
      .select()
      .from(opportunityJourneyTasks)
      .where(eq(opportunityJourneyTasks.journeyId, journeyId))
      .orderBy(asc(opportunityJourneyTasks.position))
      .execute();
  }

  async insertTasksIfAbsent(
    userId: string,
    journeyId: string,
    tasks: Array<
      Omit<
        NewOpportunityJourneyTask,
        "id" | "journeyId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<OpportunityJourneyTask[]> {
    const journey = await this.findJourneyForUser(userId, journeyId);
    if (!journey) {
      throw new OpportunityJourneyRepositoryError(
        "JOURNEY_NOT_FOUND",
        "The journey does not exist for this user.",
      );
    }

    if (tasks.length > 0) {
      await this.database
        .insert(opportunityJourneyTasks)
        .values(
          tasks.map((task) => ({
            ...task,
            journeyId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        )
        .onConflictDoNothing({
          target: [
            opportunityJourneyTasks.journeyId,
            opportunityJourneyTasks.position,
          ],
        })
        .execute();
    }

    return this.listTasksForJourney(userId, journeyId);
  }
}
