import { Injectable } from "@nestjs/common";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import type { OpportunityJourney, OpportunityJourneyTask } from "../db/opportunity-journey.schema";
import { OpportunityIntentService } from "./opportunity-intent.service";
import { OpportunityJourneyOperationsRepository } from "./opportunity-journey-operations.repository";
import {
  OpportunityJourneyRepositoryError,
  type JourneyWithDeadline,
} from "./opportunity-journeys.repository";
import { buildOpportunityDecisionSupport } from "./opportunity-decision-support";
import { estimateOpportunityEffortHours, scheduleOpportunityJourneyTasks } from "./opportunity-effort";
import { resolveOpportunityJourneyTemplate } from "./opportunity-journey-templates";
import { deriveOpportunityNextAction } from "./opportunity-next-action";
import {
  validateOpportunityJourneyTransition,
  isActiveJourneyState,
} from "./opportunity-journey-state";
import type {
  OpportunityJourneyState,
  OpportunityPublicStage,
} from "./opportunity-journey.types";
import { OpportunityJourneyDomainError } from "./opportunity-journey.errors";
import type {
  ApplicationMutationInput,
  CreateOpportunityJourneyInput,
  OpportunityJourneyOutcomeInput,
  SetOpportunityJourneyPriorityInput,
  TransitionOpportunityJourneyInput,
  UpdateOpportunityJourneyTaskInput,
} from "./dto/opportunity-journey.dto";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function opportunityDeadline(opportunity: Record<string, unknown>): Date | null {
  const value =
    opportunity.deadline ?? opportunity.closeDate ?? opportunity.close_date;
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function opportunityCategory(opportunity: Record<string, unknown>): string {
  return text(
    opportunity.type ??
      opportunity.canonicalCategory ??
      opportunity.canonical_category ??
      opportunity.category,
  );
}

function requirementsText(opportunity: Record<string, unknown>): string {
  const metadata = record(opportunity.metadata);
  return [
    text(opportunity.eligibilityCriteria ?? opportunity.eligibility_criteria),
    text(opportunity.description),
    ...stringArray(metadata.requirements),
  ]
    .filter(Boolean)
    .join(" ");
}

function journeyError(error: unknown): never {
  if (error instanceof OpportunityJourneyDomainError) throw error;
  if (error instanceof OpportunityJourneyRepositoryError) {
    const details = error.currentJourney
      ? { currentJourney: error.currentJourney }
      : {};
    throw new OpportunityJourneyDomainError(error.code, error.message, details);
  }
  throw error;
}

const ACTIVE_LIMIT = 3;

@Injectable()
export class OpportunityJourneysService {
  constructor(
    private readonly repository: OpportunityJourneyOperationsRepository,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly intentService: OpportunityIntentService,
  ) {}

  private async loadOpportunity(
    opportunityId: string,
  ): Promise<Record<string, unknown>> {
    const opportunity = await this.opportunitiesService.findOne(opportunityId);
    if (!opportunity) {
      throw new OpportunityJourneyDomainError(
        "OPPORTUNITY_NOT_FOUND",
        "The opportunity no longer exists.",
      );
    }
    return record(opportunity);
  }

  private async profileSnapshot(userId: string): Promise<Record<string, unknown>> {
    try {
      return record(await this.intentService.getProfileSnapshot(userId));
    } catch {
      return {};
    }
  }

  private async toView(
    userId: string,
    journey: OpportunityJourney,
    opportunity?: Record<string, unknown>,
    tasks?: OpportunityJourneyTask[],
  ) {
    const hydratedOpportunity =
      opportunity ?? (await this.loadOpportunity(journey.opportunityId));
    const hydratedTasks =
      tasks ?? (await this.repository.listTasksForJourney(userId, journey.id));
    const guidance = deriveOpportunityNextAction({
      state: journey.state,
      tasks: hydratedTasks,
      opportunityDeadline: opportunityDeadline(hydratedOpportunity),
    });

    return {
      journey,
      opportunity: hydratedOpportunity,
      tasks: hydratedTasks,
      nextAction: guidance.action,
      progress: guidance.progress,
    };
  }

  async createJourney(
    userId: string,
    input: CreateOpportunityJourneyInput,
  ) {
    const opportunity = await this.loadOpportunity(input.opportunityId);
    const deadline = opportunityDeadline(opportunity);
    if (
      input.action === "pursue" &&
      deadline &&
      deadline.getTime() < Date.now()
    ) {
      throw new OpportunityJourneyDomainError(
        "OPPORTUNITY_EXPIRED",
        "This opportunity deadline has passed.",
      );
    }

    const [intent, profile] = await Promise.all([
      this.intentService.ensureActiveIntent(userId),
      this.profileSnapshot(userId),
    ]);
    const matchScore = numberOrNull(
      opportunity.match ?? opportunity.matchScore ?? opportunity.match_score,
    );
    const support = buildOpportunityDecisionSupport({
      eligibility: opportunity.eligibility ?? null,
      profile,
      matchScore,
      matchReasons: stringArray(
        opportunity.matchReasons ?? opportunity.match_reasons,
      ),
      matchRisks: stringArray(opportunity.matchRisks ?? opportunity.match_risks),
      deadline,
    });

    if (
      input.action === "pursue" &&
      support.eligibilityStatus === "ineligible"
    ) {
      throw new OpportunityJourneyDomainError(
        "OPPORTUNITY_INELIGIBLE",
        "Your current profile does not meet a compulsory eligibility rule.",
        { blockers: support.eligibilityBlockers },
      );
    }

    const category = opportunityCategory(opportunity);
    const estimatedEffortHours = estimateOpportunityEffortHours({
      category,
      requirementsText: requirementsText(opportunity),
    });

    try {
      return await this.repository.withUserJourneyLock(
        userId,
        async (lockedRepository) => {
          const existing = await lockedRepository.findJourneyByOpportunity(
            userId,
            input.opportunityId,
          );

          if (input.action === "shortlist") {
            const shortlisted =
              existing ??
              (await lockedRepository.createOrReadJourney({
                userId,
                opportunityId: input.opportunityId,
                intentId: input.intentId ?? intent.id,
                state: "shortlisted",
                priority: "none",
                eligibilityStatus: support.eligibilityStatus,
                eligibilityConfidence: support.eligibilityConfidence,
                eligibilityReasons: support.eligibilityReasons,
                eligibilityBlockers: support.eligibilityBlockers,
                matchScoreSnapshot: matchScore,
                matchReasonsSnapshot: support.matchReasons,
                matchRisksSnapshot: support.matchRisks,
                estimatedEffortHours,
                idempotencyKey: input.idempotencyKey,
                eventType: "journey_shortlisted",
                source: "backend",
              }));
            return this.toView(userId, shortlisted, opportunity, []);
          }

          if (existing && isActiveJourneyState(existing.state)) {
            return this.toView(userId, existing, opportunity);
          }

          const active = await lockedRepository.listJourneysByStage(
            userId,
            "pursuing",
          );
          if (active.length >= ACTIVE_LIMIT) {
            throw new OpportunityJourneyDomainError(
              "ACTIVE_PURSUIT_LIMIT_REACHED",
              "You can actively pursue at most three opportunities.",
              { activePursuits: active },
            );
          }

          const hasPrimary = active.some(
            (item) => item.priority === "primary",
          );
          const priority = input.priority
            ? input.priority === "primary" && hasPrimary
              ? "secondary"
              : input.priority
            : hasPrimary
              ? "secondary"
              : "primary";
          const committedAt = new Date();
          const templates = resolveOpportunityJourneyTemplate(category);
          const scheduledTasks = scheduleOpportunityJourneyTasks({
            tasks: templates,
            startAt: committedAt,
            deadline,
            weeklyHours: Number(intent.weeklyHours ?? 4),
            estimatedEffortHours,
          });
          const firstDueAt = scheduledTasks[0]?.dueAt ?? deadline;

          const activeJourney = existing
            ? await lockedRepository.updateJourneyVersioned({
                userId,
                journeyId: existing.id,
                expectedVersion: existing.version,
                patch: {
                  state: "pursuing",
                  priority,
                  intentId: input.intentId ?? intent.id,
                  eligibilityStatus: support.eligibilityStatus,
                  eligibilityConfidence: String(
                    support.eligibilityConfidence,
                  ),
                  eligibilityReasons: support.eligibilityReasons,
                  eligibilityBlockers: support.eligibilityBlockers,
                  matchScoreSnapshot: matchScore,
                  matchReasonsSnapshot: support.matchReasons,
                  matchRisksSnapshot: support.matchRisks,
                  estimatedEffortHours: String(estimatedEffortHours),
                  nextActionAt: firstDueAt,
                  committedAt,
                },
                idempotencyKey: input.idempotencyKey,
                eventType: "journey_activated",
                source: "backend",
              })
            : await lockedRepository.createOrReadJourney({
                userId,
                opportunityId: input.opportunityId,
                intentId: input.intentId ?? intent.id,
                state: "pursuing",
                priority,
                eligibilityStatus: support.eligibilityStatus,
                eligibilityConfidence: support.eligibilityConfidence,
                eligibilityReasons: support.eligibilityReasons,
                eligibilityBlockers: support.eligibilityBlockers,
                matchScoreSnapshot: matchScore,
                matchReasonsSnapshot: support.matchReasons,
                matchRisksSnapshot: support.matchRisks,
                estimatedEffortHours,
                nextActionAt: firstDueAt,
                committedAt,
                idempotencyKey: input.idempotencyKey,
                eventType: "journey_activated",
                source: "backend",
              });

          const tasks = await lockedRepository.insertTasksIfAbsent(
            userId,
            activeJourney.id,
            scheduledTasks.map((task) => ({
              taskType: task.taskType,
              title: task.title,
              description: task.description,
              position: task.position,
              status: "pending",
              dueAt: task.dueAt,
              required: task.required,
              source: task.source,
              metadata: {},
              completedAt: null,
            })),
          );

          return this.toView(userId, activeJourney, opportunity, tasks);
        },
      );
    } catch (error) {
      return journeyError(error);
    }
  }

  async getJourney(userId: string, journeyId: string) {
    const journey = await this.repository.findJourneyForUser(userId, journeyId);
    if (!journey) {
      throw new OpportunityJourneyDomainError(
        "JOURNEY_NOT_FOUND",
        "The opportunity journey does not exist.",
      );
    }
    return this.toView(userId, journey);
  }

  async listJourneys(
    userId: string,
    stage: OpportunityPublicStage = "pursuing",
  ) {
    const journeys = await this.repository.listJourneysByStage(userId, stage);
    return Promise.all(
      journeys.map((journey: JourneyWithDeadline) =>
        this.toView(userId, journey),
      ),
    );
  }

  async transitionJourney(
    userId: string,
    journeyId: string,
    input: TransitionOpportunityJourneyInput,
  ) {
    const current = await this.repository.findJourneyForUser(userId, journeyId);
    if (!current) {
      throw new OpportunityJourneyDomainError(
        "JOURNEY_NOT_FOUND",
        "The opportunity journey does not exist.",
      );
    }

    const validation = validateOpportunityJourneyTransition(
      current.state,
      input.state,
      "generic",
    );
    if (!validation.ok) {
      throw new OpportunityJourneyDomainError(
        validation.code,
        "This journey state change requires a dedicated action.",
      );
    }

    if (input.state === "ready_to_apply") {
      const tasks = await this.repository.listTasksForJourney(userId, journeyId);
      const incomplete = tasks.some(
        (task) => task.required && task.status !== "completed",
      );
      if (incomplete) {
        throw new OpportunityJourneyDomainError(
          "REQUIRED_TASKS_INCOMPLETE",
          "Complete all required preparation tasks before applying.",
        );
      }
    }

    try {
      const updated = await this.repository.updateJourneyVersioned({
        userId,
        journeyId,
        expectedVersion: input.expectedVersion,
        patch: { state: input.state },
        idempotencyKey: input.idempotencyKey,
        eventType: `journey_${input.state}`,
        source: "backend",
      });
      return this.toView(userId, updated);
    } catch (error) {
      return journeyError(error);
    }
  }

  async setPriority(
    userId: string,
    journeyId: string,
    input: SetOpportunityJourneyPriorityInput,
  ) {
    try {
      return await this.repository.withUserJourneyLock(
        userId,
        async (lockedRepository) => {
          const target = await lockedRepository.findJourneyForUser(
            userId,
            journeyId,
          );
          if (!target) {
            throw new OpportunityJourneyDomainError(
              "JOURNEY_NOT_FOUND",
              "The opportunity journey does not exist.",
            );
          }
          if (!isActiveJourneyState(target.state)) {
            throw new OpportunityJourneyDomainError(
              "INVALID_JOURNEY_TRANSITION",
              "Only active pursuits can receive active priority.",
            );
          }

          const active = await lockedRepository.listJourneysByStage(
            userId,
            "pursuing",
          );
          if (input.priority === "primary") {
            for (const item of active) {
              if (item.id !== journeyId && item.priority === "primary") {
                await lockedRepository.updateJourneyVersioned({
                  userId,
                  journeyId: item.id,
                  expectedVersion: item.version,
                  patch: { priority: "secondary" },
                  idempotencyKey: `${input.idempotencyKey}:demote:${item.id}`,
                  eventType: "journey_priority_changed",
                  source: "backend",
                });
              }
            }
          }

          const updated = await lockedRepository.updateJourneyVersioned({
            userId,
            journeyId,
            expectedVersion: input.expectedVersion,
            patch: { priority: input.priority },
            idempotencyKey: input.idempotencyKey,
            eventType: "journey_priority_changed",
            source: "backend",
          });
          return this.toView(userId, updated);
        },
      );
    } catch (error) {
      return journeyError(error);
    }
  }

  async updateTask(
    userId: string,
    journeyId: string,
    taskId: string,
    input: UpdateOpportunityJourneyTaskInput,
  ) {
    const journey = await this.repository.findJourneyForUser(userId, journeyId);
    if (!journey) {
      throw new OpportunityJourneyDomainError(
        "JOURNEY_NOT_FOUND",
        "The opportunity journey does not exist.",
      );
    }
    const tasks = await this.repository.listTasksForJourney(userId, journeyId);
    const selected = tasks.find((task) => task.id === taskId);
    if (!selected) {
      throw new OpportunityJourneyDomainError(
        "TASK_NOT_FOUND",
        "The preparation task does not exist.",
      );
    }
    if (selected.required && input.status === "skipped") {
      throw new OpportunityJourneyDomainError(
        "REQUIRED_TASK_CANNOT_BE_SKIPPED",
        "A required preparation task cannot be skipped.",
      );
    }

    const simulated = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: input.status,
          }
        : task,
    );
    const opportunity = await this.loadOpportunity(journey.opportunityId);
    const guidance = deriveOpportunityNextAction({
      state: journey.state,
      tasks: simulated,
      opportunityDeadline: opportunityDeadline(opportunity),
    });
    const allRequiredComplete = simulated
      .filter((task) => task.required)
      .every((task) => task.status === "completed");
    const nextState: OpportunityJourneyState = allRequiredComplete
      ? "ready_to_apply"
      : journey.state === "pursuing"
        ? "preparing"
        : journey.state;

    try {
      const result = await this.repository.updateTaskStatus({
        userId,
        journeyId,
        taskId,
        status: input.status,
        expectedVersion: input.expectedVersion,
        journeyPatch: {
          state: nextState,
          nextActionAt: guidance.action.dueAt,
        },
        idempotencyKey: input.idempotencyKey,
        eventType:
          input.status === "completed"
            ? "task_completed"
            : input.status === "skipped"
              ? "task_skipped"
              : input.status === "in_progress"
                ? "task_started"
                : "task_reset",
        source: "backend",
      });
      return this.toView(userId, result.journey, opportunity, result.tasks);
    } catch (error) {
      return journeyError(error);
    }
  }

  async markApplicationOpened(
    userId: string,
    journeyId: string,
    input: ApplicationMutationInput,
  ) {
    return this.protectedTransition(
      userId,
      journeyId,
      input,
      "application_opened",
      "generic",
      {
        applyLinkOpenedAt: new Date(),
      },
      "application_opened",
    );
  }

  async confirmApplication(
    userId: string,
    journeyId: string,
    input: ApplicationMutationInput,
  ) {
    const result = await this.protectedTransition(
      userId,
      journeyId,
      input,
      "applied",
      "application_confirmation",
      {
        appliedAt: new Date(),
        priority: "none",
        nextActionAt: null,
      },
      "application_confirmed",
    );

    await this.opportunitiesService.recordUserOpportunitySignal(userId, {
      opportunityId: result.journey.opportunityId,
      signalType: "apply",
      source: "opportunity_pipeline",
      details: { journeyId },
    });
    return result;
  }

  async recordOutcome(
    userId: string,
    journeyId: string,
    input: OpportunityJourneyOutcomeInput,
  ) {
    const result = await this.protectedTransition(
      userId,
      journeyId,
      input,
      input.outcome,
      "outcome",
      {
        outcome: input.outcome,
        closedAt: new Date(),
        priority: "none",
        nextActionAt: null,
      },
      "journey_outcome",
    );

    const signalType = {
      offer: "outcome_offer",
      rejected: "outcome_rejected",
      withdrawn: "outcome_withdrawn",
      no_response: "outcome_ghosted",
      expired: "outcome_withdrawn",
    }[input.outcome] as
      | "outcome_offer"
      | "outcome_rejected"
      | "outcome_withdrawn"
      | "outcome_ghosted";
    await this.opportunitiesService.recordUserOpportunitySignal(userId, {
      opportunityId: result.journey.opportunityId,
      signalType,
      source: "opportunity_pipeline",
      details: { journeyId, outcome: input.outcome },
    });
    return result;
  }

  private async protectedTransition(
    userId: string,
    journeyId: string,
    input: ApplicationMutationInput,
    state: OpportunityJourneyState,
    authority: "generic" | "application_confirmation" | "outcome",
    patch: Record<string, unknown>,
    eventType: string,
  ) {
    const current = await this.repository.findJourneyForUser(userId, journeyId);
    if (!current) {
      throw new OpportunityJourneyDomainError(
        "JOURNEY_NOT_FOUND",
        "The opportunity journey does not exist.",
      );
    }
    const validation = validateOpportunityJourneyTransition(
      current.state,
      state,
      authority,
    );
    if (!validation.ok) {
      throw new OpportunityJourneyDomainError(
        validation.code,
        "This opportunity journey transition is not allowed.",
      );
    }

    try {
      const updated = await this.repository.updateJourneyVersioned({
        userId,
        journeyId,
        expectedVersion: input.expectedVersion,
        patch: { ...patch, state },
        idempotencyKey: input.idempotencyKey,
        eventType,
        source: "backend",
      });
      return this.toView(userId, updated);
    } catch (error) {
      return journeyError(error);
    }
  }
}
