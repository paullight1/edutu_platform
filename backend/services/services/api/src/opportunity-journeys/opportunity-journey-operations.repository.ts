import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  opportunityJourneyEvents,
  opportunityJourneyTasks,
  userOpportunityJourneys,
  type OpportunityJourney,
  type OpportunityJourneyEvent,
  type OpportunityJourneyTask,
} from "../db/opportunity-journey.schema";
import { toDatabaseUserId } from "../common/user-id";
import {
  eventMetadataWithMutationHash,
  hashOpportunityJourneyMutation,
  readMutationHash,
  type OpportunityJourneyEventInput,
} from "./opportunity-journey-event";
import {
  OpportunityJourneyRepositoryError,
  OpportunityJourneysRepository,
  type OpportunityJourneyPatch,
} from "./opportunity-journeys.repository";

export interface UpdateTaskStatusInput extends OpportunityJourneyEventInput {
  userId: string;
  journeyId: string;
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  expectedVersion: number;
  journeyPatch: OpportunityJourneyPatch;
}

function convertedUserId(userId: string): string {
  const value = toDatabaseUserId(userId);
  if (!value) {
    throw new OpportunityJourneyRepositoryError(
      "INVALID_USER_ID",
      "A user id is required for opportunity journey persistence.",
    );
  }
  return value;
}

function mutationHash(input: unknown): string {
  return hashOpportunityJourneyMutation(input);
}

export class OpportunityJourneyOperationsRepository extends OpportunityJourneysRepository {
  constructor(private readonly operationsDatabase: any = db) {
    super(operationsDatabase);
  }

  async listJourneysForUser(userId: string): Promise<OpportunityJourney[]> {
    return this.operationsDatabase
      .select()
      .from(userOpportunityJourneys)
      .where(eq(userOpportunityJourneys.userId, convertedUserId(userId)))
      .orderBy(asc(userOpportunityJourneys.updatedAt))
      .execute();
  }

  async recordUserEvent(
    userId: string,
    event: OpportunityJourneyEventInput,
  ): Promise<OpportunityJourneyEvent> {
    const databaseUserId = convertedUserId(userId);
    const mutation = {
      userId: databaseUserId,
      eventType: event.eventType,
      source: event.source,
      metadata: event.metadata ?? {},
    };

    return this.operationsDatabase.transaction(async (transaction: any) => {
      const [existing] = await transaction
        .select()
        .from(opportunityJourneyEvents)
        .where(
          and(
            eq(opportunityJourneyEvents.userId, databaseUserId),
            eq(opportunityJourneyEvents.idempotencyKey, event.idempotencyKey),
          ),
        )
        .limit(1)
        .execute();

      if (existing) {
        if (readMutationHash(existing.metadata) !== mutationHash(mutation)) {
          throw new OpportunityJourneyRepositoryError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used with a different event.",
          );
        }
        return existing;
      }

      const [created] = await transaction
        .insert(opportunityJourneyEvents)
        .values({
          userId: databaseUserId,
          eventType: event.eventType,
          source: event.source,
          idempotencyKey: event.idempotencyKey,
          metadata: eventMetadataWithMutationHash(event.metadata, mutation),
        })
        .returning()
        .execute();
      return created;
    });
  }

  async withUserJourneyLock<T>(
    userId: string,
    operation: (
      repository: OpportunityJourneyOperationsRepository,
    ) => Promise<T>,
  ): Promise<T> {
    const databaseUserId = convertedUserId(userId);
    return this.operationsDatabase.transaction(async (transaction: any) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${databaseUserId}))`,
      );
      return operation(new OpportunityJourneyOperationsRepository(transaction));
    });
  }

  async updateTaskStatus(input: UpdateTaskStatusInput): Promise<{
    journey: OpportunityJourney;
    task: OpportunityJourneyTask;
    tasks: OpportunityJourneyTask[];
  }> {
    const databaseUserId = convertedUserId(input.userId);
    const mutation = {
      userId: databaseUserId,
      journeyId: input.journeyId,
      taskId: input.taskId,
      status: input.status,
      expectedVersion: input.expectedVersion,
      journeyPatch: input.journeyPatch,
      eventType: input.eventType,
      source: input.source,
      metadata: input.metadata ?? {},
    };

    return this.operationsDatabase.transaction(async (transaction: any) => {
      const [existingEvent] = await transaction
        .select()
        .from(opportunityJourneyEvents)
        .where(
          and(
            eq(opportunityJourneyEvents.userId, databaseUserId),
            eq(opportunityJourneyEvents.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
        .execute();

      if (existingEvent) {
        if (
          readMutationHash(existingEvent.metadata) !== mutationHash(mutation)
        ) {
          throw new OpportunityJourneyRepositoryError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used with a different task mutation.",
          );
        }
        const current = await this.findJourneyForUser(
          input.userId,
          input.journeyId,
          transaction,
        );
        const [currentTask] = await transaction
          .select()
          .from(opportunityJourneyTasks)
          .where(
            and(
              eq(opportunityJourneyTasks.id, input.taskId),
              eq(opportunityJourneyTasks.journeyId, input.journeyId),
            ),
          )
          .limit(1)
          .execute();
        if (!current || !currentTask) {
          throw new OpportunityJourneyRepositoryError(
            "JOURNEY_NOT_FOUND",
            "The idempotent task result no longer exists.",
          );
        }
        const tasks = await transaction
          .select()
          .from(opportunityJourneyTasks)
          .where(eq(opportunityJourneyTasks.journeyId, input.journeyId))
          .orderBy(asc(opportunityJourneyTasks.position))
          .execute();
        return { journey: current, task: currentTask, tasks };
      }

      const [journey] = await transaction
        .select()
        .from(userOpportunityJourneys)
        .where(
          and(
            eq(userOpportunityJourneys.id, input.journeyId),
            eq(userOpportunityJourneys.userId, databaseUserId),
          ),
        )
        .limit(1)
        .execute();
      if (!journey) {
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_NOT_FOUND",
          "The journey does not exist for this user.",
        );
      }
      if (journey.version !== input.expectedVersion) {
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_VERSION_CONFLICT",
          "The journey was changed by another client.",
          journey,
        );
      }

      const [task] = await transaction
        .select()
        .from(opportunityJourneyTasks)
        .where(
          and(
            eq(opportunityJourneyTasks.id, input.taskId),
            eq(opportunityJourneyTasks.journeyId, input.journeyId),
          ),
        )
        .limit(1)
        .execute();
      if (!task) {
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_NOT_FOUND",
          "The task does not exist for this journey.",
        );
      }

      const [updatedTask] = await transaction
        .update(opportunityJourneyTasks)
        .set({
          status: input.status,
          completedAt: input.status === "completed" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(opportunityJourneyTasks.id, input.taskId))
        .returning()
        .execute();

      const [updatedJourney] = await transaction
        .update(userOpportunityJourneys)
        .set({
          ...input.journeyPatch,
          version: input.expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userOpportunityJourneys.id, input.journeyId),
            eq(userOpportunityJourneys.userId, databaseUserId),
            eq(userOpportunityJourneys.version, input.expectedVersion),
          ),
        )
        .returning()
        .execute();
      if (!updatedJourney) {
        throw new OpportunityJourneyRepositoryError(
          "JOURNEY_VERSION_CONFLICT",
          "The journey was changed by another client.",
          journey,
        );
      }

      await transaction
        .insert(opportunityJourneyEvents)
        .values({
          userId: databaseUserId,
          journeyId: updatedJourney.id,
          intentId: updatedJourney.intentId,
          opportunityId: updatedJourney.opportunityId,
          eventType: input.eventType,
          source: input.source,
          idempotencyKey: input.idempotencyKey,
          metadata: eventMetadataWithMutationHash(input.metadata, mutation),
        })
        .execute();

      const tasks = await transaction
        .select()
        .from(opportunityJourneyTasks)
        .where(eq(opportunityJourneyTasks.journeyId, input.journeyId))
        .orderBy(asc(opportunityJourneyTasks.position))
        .execute();

      return {
        journey: updatedJourney,
        task: updatedTask,
        tasks,
      };
    });
  }

  async countActivePursuitsLocked(userId: string): Promise<number> {
    const rows = await this.operationsDatabase
      .select({ id: userOpportunityJourneys.id })
      .from(userOpportunityJourneys)
      .where(
        and(
          eq(userOpportunityJourneys.userId, convertedUserId(userId)),
          inArray(userOpportunityJourneys.state, [
            "pursuing",
            "preparing",
            "ready_to_apply",
            "application_opened",
          ]),
        ),
      )
      .execute();
    return rows.length;
  }
}
