import {
  inferOpportunityIntent,
  OpportunityIntentService,
  type OpportunityIntentSourceSnapshot,
} from "./opportunity-intent.service";
import type { OpportunityIntentInput } from "./dto/opportunity-intent.dto";

const USER_ID = "user_intent_test";

function createRepository(activeIntent: Record<string, unknown> | null = null) {
  return {
    getActiveIntent: jest.fn().mockResolvedValue(activeIntent),
    replaceActiveIntent: jest.fn(async (_userId: string, input: unknown) => ({
      id: "intent-1",
      ...(input as object),
    })),
  };
}

function createSource(snapshot: OpportunityIntentSourceSnapshot) {
  return {
    load: jest.fn().mockResolvedValue(snapshot),
  };
}

describe("inferOpportunityIntent", () => {
  it.each([
    ["scholarship funding for postgraduate study", "study_funding"],
    ["internship work experience", "work_experience"],
    ["graduate job employment", "employment"],
    ["startup grant and business funding", "business_funding"],
    ["leadership fellowship", "leadership_growth"],
    ["course bootcamp skills", "skill_building"],
  ] as const)("maps %s to %s", (text, goalKey) => {
    expect(
      inferOpportunityIntent({
        profile: { interests: [text] },
        preferences: {},
        goals: [],
        signals: [],
      }).goalKey,
    ).toBe(goalKey);
  });

  it("uses open exploration when evidence is ambiguous", () => {
    expect(
      inferOpportunityIntent({
        profile: {},
        preferences: {},
        goals: [],
        signals: [],
      }).goalKey,
    ).toBe("open_exploration");
  });

  it("maps remote-only and deadline preferences to the intent contract", () => {
    expect(
      inferOpportunityIntent({
        profile: {},
        preferences: {
          preferredOpportunityTypes: ["scholarship"],
          preferredRegions: ["Europe"],
          remoteOnly: true,
          maxDeadlineDays: 47,
        },
        goals: [],
        signals: [],
      }),
    ).toMatchObject({
      opportunityTypes: ["scholarship"],
      locations: ["Europe"],
      remotePreference: "required",
      actionHorizonDays: 90,
      source: "inferred",
    });
  });
});

describe("OpportunityIntentService", () => {
  it("returns an explicit active intent unchanged", async () => {
    const active = {
      id: "existing",
      goalKey: "employment",
      source: "explicit",
      status: "active",
    };
    const repository = createRepository(active);
    const source = createSource({
      profile: {},
      preferences: {},
      goals: [],
      signals: [],
    });
    const service = new OpportunityIntentService(
      repository as never,
      source as never,
    );

    await expect(service.getCurrentIntent(USER_ID)).resolves.toEqual({
      ...active,
      persisted: true,
    });
    expect(source.load).not.toHaveBeenCalled();
  });

  it("returns an inferred non-persisted intent when no active row exists", async () => {
    const repository = createRepository(null);
    const source = createSource({
      profile: { interests: ["scholarships"] },
      preferences: { remoteOnly: true },
      goals: [],
      signals: [],
    });
    const service = new OpportunityIntentService(
      repository as never,
      source as never,
    );

    await expect(service.getCurrentIntent(USER_ID)).resolves.toMatchObject({
      goalKey: "study_funding",
      source: "inferred",
      persisted: false,
    });
    expect(repository.replaceActiveIntent).not.toHaveBeenCalled();
  });

  it("persists an inferred intent only when an active foreign-key row is needed", async () => {
    const repository = createRepository(null);
    const source = createSource({
      profile: { interests: ["internship"] },
      preferences: {},
      goals: [],
      signals: [],
    });
    const service = new OpportunityIntentService(
      repository as never,
      source as never,
    );

    const ensured = await service.ensureActiveIntent(USER_ID);
    expect(repository.replaceActiveIntent).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        goalKey: "work_experience",
        source: "inferred",
      }),
      expect.objectContaining({
        eventType: "intent_created",
        idempotencyKey: expect.stringContaining("intent-inferred:"),
      }),
    );
    expect(ensured).toMatchObject({ goalKey: "work_experience" });
  });

  it("archives and replaces the current intent through the repository", async () => {
    const repository = createRepository({ id: "old", source: "explicit" });
    const source = createSource({
      profile: {},
      preferences: {},
      goals: [],
      signals: [],
    });
    const service = new OpportunityIntentService(
      repository as never,
      source as never,
    );
    const input: OpportunityIntentInput = {
      goalKey: "business_funding",
      opportunityTypes: ["grant", "grant"],
      locations: ["Nigeria", " Nigeria "],
      remotePreference: "preferred",
      actionHorizonDays: 180,
      weeklyHours: 6,
      readinessMode: "apply_now",
    };

    await service.saveExplicitIntent(USER_ID, input, "intent-edit-1");

    expect(repository.replaceActiveIntent).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        goalKey: "business_funding",
        opportunityTypes: ["grant"],
        locations: ["Nigeria"],
        source: "explicit",
      }),
      expect.objectContaining({
        eventType: "intent_updated",
        idempotencyKey: "intent-edit-1",
      }),
    );
  });
});
