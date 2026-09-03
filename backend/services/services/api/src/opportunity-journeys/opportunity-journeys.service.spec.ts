import { OpportunityJourneysService } from "./opportunity-journeys.service";
import { OpportunityJourneyDomainError } from "./opportunity-journey.errors";

const USER_ID = "user_journey_service";
const OPPORTUNITY_ID = "11111111-1111-4111-8111-111111111111";

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    id: OPPORTUNITY_ID,
    title: "Full scholarship",
    category: "scholarship",
    type: "scholarship",
    location: "Nigeria",
    deadline: new Date("2026-11-01T00:00:00Z"),
    eligibility: { countries: ["Nigeria"] },
    match: 82,
    matchReasons: ["Matches your study goal"],
    matchRisks: ["Requires references"],
    metadata: { requirements: ["Transcript", "References"] },
    ...overrides,
  };
}

function journey(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    opportunityId: OPPORTUNITY_ID,
    intentId: "44444444-4444-4444-8444-444444444444",
    state: "shortlisted",
    priority: "none",
    eligibilityStatus: "eligible",
    eligibilityConfidence: "1",
    eligibilityReasons: [],
    eligibilityBlockers: [],
    matchScoreSnapshot: 82,
    matchReasonsSnapshot: [],
    matchRisksSnapshot: [],
    estimatedEffortHours: "8",
    nextActionAt: null,
    committedAt: null,
    applyLinkOpenedAt: null,
    appliedAt: null,
    closedAt: null,
    outcome: null,
    version: 1,
    metadata: {},
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: new Date("2026-09-03T00:00:00Z"),
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    journeyId: "22222222-2222-4222-8222-222222222222",
    taskType: "eligibility",
    title: "Confirm eligibility",
    description: null,
    position: 0,
    status: "pending",
    dueAt: new Date("2026-09-10T00:00:00Z"),
    required: true,
    source: "template",
    metadata: {},
    completedAt: null,
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: new Date("2026-09-03T00:00:00Z"),
    ...overrides,
  };
}

function createHarness(overrides: {
  existing?: ReturnType<typeof journey> | null;
  active?: Array<ReturnType<typeof journey>>;
  foundOpportunity?: Record<string, unknown> | null;
} = {}) {
  const state = {
    current: overrides.existing ?? null,
    tasks: [] as Array<ReturnType<typeof task>>,
  };
  const repository: Record<string, jest.Mock> = {
    withUserJourneyLock: jest.fn(async (_userId, operation) =>
      operation(repository),
    ),
    findJourneyByOpportunity: jest.fn(async () => state.current),
    findJourneyForUser: jest.fn(async () => state.current),
    listJourneysByStage: jest.fn().mockResolvedValue(overrides.active ?? []),
    createOrReadJourney: jest.fn(async (input) => {
      state.current = journey({
        state: input.state,
        priority: input.priority,
        intentId: input.intentId,
        eligibilityStatus: input.eligibilityStatus,
        version: 1,
      });
      return state.current;
    }),
    updateJourneyVersioned: jest.fn(async (input) => {
      state.current = journey({
        ...(state.current ?? {}),
        ...input.patch,
        version: input.expectedVersion + 1,
      });
      return state.current;
    }),
    insertTasksIfAbsent: jest.fn(async (_userId, _journeyId, values) => {
      if (state.tasks.length === 0) {
        state.tasks = values.map((value: Record<string, unknown>, index: number) =>
          task({
            id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
            ...value,
          }),
        );
      }
      return state.tasks;
    }),
    listTasksForJourney: jest.fn(async () => state.tasks),
    updateTaskStatus: jest.fn(async (input) => {
      state.tasks = state.tasks.map((item) =>
        item.id === input.taskId
          ? task({
              ...item,
              status: input.status,
              completedAt: input.status === "completed" ? new Date() : null,
            })
          : item,
      );
      state.current = journey({
        ...(state.current ?? {}),
        ...input.journeyPatch,
        version: input.expectedVersion + 1,
      });
      return {
        journey: state.current,
        tasks: state.tasks,
      };
    }),
  };
  const opportunitiesService = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        overrides.foundOpportunity === undefined
          ? opportunity()
          : overrides.foundOpportunity,
      ),
    recordUserOpportunitySignal: jest.fn().mockResolvedValue({ recorded: true }),
  };
  const intentService = {
    ensureActiveIntent: jest.fn().mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      goalKey: "study_funding",
      weeklyHours: 4,
    }),
  };
  const service = new OpportunityJourneysService(
    repository as never,
    opportunitiesService as never,
    intentService as never,
  );

  return { service, repository, opportunitiesService, intentService, state };
}

describe("OpportunityJourneysService", () => {
  it("shortlists without creating preparation tasks", async () => {
    const { service, repository } = createHarness();

    const result = await service.createJourney(USER_ID, {
      opportunityId: OPPORTUNITY_ID,
      action: "shortlist",
      idempotencyKey: "shortlist-1",
    });

    expect(result.journey).toMatchObject({
      state: "shortlisted",
      priority: "none",
    });
    expect(repository.insertTasksIfAbsent).not.toHaveBeenCalled();
  });

  it("makes the first active pursuit primary and creates tasks once", async () => {
    const { service, repository } = createHarness({ active: [] });

    const result = await service.createJourney(USER_ID, {
      opportunityId: OPPORTUNITY_ID,
      action: "pursue",
      idempotencyKey: "pursue-1",
    });

    expect(result.journey).toMatchObject({
      state: "pursuing",
      priority: "primary",
    });
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.nextAction.key).toBe("continue_task");
    expect(repository.withUserJourneyLock).toHaveBeenCalled();
  });

  it("makes the second and third pursuits secondary", async () => {
    const { service } = createHarness({
      active: [journey({ state: "pursuing", priority: "primary" })],
    });

    const result = await service.createJourney(USER_ID, {
      opportunityId: OPPORTUNITY_ID,
      action: "pursue",
      idempotencyKey: "pursue-secondary",
    });

    expect(result.journey.priority).toBe("secondary");
  });

  it("blocks a fourth active pursuit with the current pursuits", async () => {
    const active = [
      journey({ id: "1", state: "pursuing", priority: "primary" }),
      journey({ id: "2", state: "preparing", priority: "secondary" }),
      journey({ id: "3", state: "ready_to_apply", priority: "secondary" }),
    ];
    const { service } = createHarness({ active });

    await expect(
      service.createJourney(USER_ID, {
        opportunityId: OPPORTUNITY_ID,
        action: "pursue",
        idempotencyKey: "pursue-fourth",
      }),
    ).rejects.toMatchObject<Partial<OpportunityJourneyDomainError>>({
      code: "ACTIVE_PURSUIT_LIMIT_REACHED",
      details: { activePursuits: active },
    });
  });

  it("rejects expired and explicitly ineligible opportunities", async () => {
    const expired = createHarness({
      foundOpportunity: opportunity({ deadline: "2026-01-01T00:00:00Z" }),
    });
    await expect(
      expired.service.createJourney(USER_ID, {
        opportunityId: OPPORTUNITY_ID,
        action: "pursue",
        idempotencyKey: "expired",
      }),
    ).rejects.toMatchObject({ code: "OPPORTUNITY_EXPIRED" });

    const ineligible = createHarness({
      foundOpportunity: opportunity({ eligibility: { countries: ["Kenya"] } }),
    });
    await expect(
      ineligible.service.createJourney(USER_ID, {
        opportunityId: OPPORTUNITY_ID,
        action: "pursue",
        idempotencyKey: "ineligible",
      }),
    ).rejects.toMatchObject({ code: "OPPORTUNITY_INELIGIBLE" });
  });

  it("upgrades an existing shortlist instead of creating a duplicate", async () => {
    const existing = journey({ state: "shortlisted", priority: "none" });
    const { service, repository } = createHarness({ existing, active: [] });

    const result = await service.createJourney(USER_ID, {
      opportunityId: OPPORTUNITY_ID,
      action: "pursue",
      idempotencyKey: "upgrade-shortlist",
    });

    expect(repository.createOrReadJourney).not.toHaveBeenCalled();
    expect(repository.updateJourneyVersioned).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        patch: expect.objectContaining({ state: "pursuing" }),
      }),
    );
    expect(result.journey.version).toBe(2);
  });

  it("moves preparation to ready when the last required task is completed", async () => {
    const existing = journey({ state: "preparing", version: 4 });
    const { service, state, repository } = createHarness({ existing });
    state.tasks = [task({ status: "pending", required: true })];

    const result = await service.updateTask(USER_ID, existing.id, state.tasks[0].id, {
      status: "completed",
      expectedVersion: 4,
      idempotencyKey: "task-complete",
    });

    expect(repository.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyPatch: expect.objectContaining({ state: "ready_to_apply" }),
      }),
    );
    expect(result.journey.state).toBe("ready_to_apply");
  });

  it("does not allow a required task to be skipped", async () => {
    const existing = journey({ state: "preparing" });
    const { service, state } = createHarness({ existing });
    state.tasks = [task({ required: true })];

    await expect(
      service.updateTask(USER_ID, existing.id, state.tasks[0].id, {
        status: "skipped",
        expectedVersion: 1,
        idempotencyKey: "skip-required",
      }),
    ).rejects.toMatchObject({ code: "REQUIRED_TASK_CANNOT_BE_SKIPPED" });
  });

  it("records opening separately from confirmed submission", async () => {
    const existing = journey({ state: "ready_to_apply", version: 2 });
    const { service, repository, opportunitiesService } = createHarness({
      existing,
    });

    const opened = await service.markApplicationOpened(USER_ID, existing.id, {
      expectedVersion: 2,
      idempotencyKey: "application-opened",
    });

    expect(opened.journey).toMatchObject({
      state: "application_opened",
      appliedAt: null,
    });
    expect(opportunitiesService.recordUserOpportunitySignal).not.toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ signalType: "applied" }),
    );

    const confirmed = await service.confirmApplication(USER_ID, existing.id, {
      expectedVersion: 3,
      idempotencyKey: "application-confirmed",
    });

    expect(confirmed.journey).toMatchObject({ state: "applied" });
    expect(repository.updateJourneyVersioned).toHaveBeenLastCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          state: "applied",
          appliedAt: expect.any(Date),
        }),
      }),
    );
    expect(opportunitiesService.recordUserOpportunitySignal).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ signalType: "applied" }),
    );
  });

  it("rejects generic use of the applied and outcome states", async () => {
    const existing = journey({ state: "application_opened", version: 3 });
    const { service } = createHarness({ existing });

    await expect(
      service.transitionJourney(USER_ID, existing.id, {
        state: "applied",
        expectedVersion: 3,
        idempotencyKey: "generic-applied",
      }),
    ).rejects.toMatchObject({ code: "APPLICATION_CONFIRMATION_REQUIRED" });
  });

  it("records an outcome only from the dedicated path", async () => {
    const existing = journey({ state: "interview", version: 5 });
    const { service } = createHarness({ existing });

    const result = await service.recordOutcome(USER_ID, existing.id, {
      outcome: "offer",
      expectedVersion: 5,
      idempotencyKey: "offer-outcome",
    });

    expect(result.journey).toMatchObject({
      state: "offer",
      outcome: "offer",
      closedAt: expect.any(Date),
    });
  });
});
