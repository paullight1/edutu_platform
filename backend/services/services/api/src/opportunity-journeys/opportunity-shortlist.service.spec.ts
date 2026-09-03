import { OpportunityShortlistService } from "./opportunity-shortlist.service";

const USER_ID = "user_shortlist";

function candidate(overrides: Record<string, unknown>) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Opportunity",
    type: "scholarship",
    category: "scholarship",
    location: "Remote",
    isRemote: true,
    deadline: "2026-11-01T00:00:00Z",
    eligibility: { countries: ["Nigeria"] },
    match: 70,
    matchReasons: ["Profile fit"],
    matchRisks: [],
    ...overrides,
  };
}

function createService(options: {
  recommendations?: unknown;
  recommendationError?: Error;
  existing?: Array<{ opportunityId: string }>;
  fallback?: unknown[];
  intent?: Record<string, unknown>;
}) {
  const opportunitiesService = {
    getPersonalizedRecommendations: options.recommendationError
      ? jest.fn().mockRejectedValue(options.recommendationError)
      : jest.fn().mockResolvedValue(
          options.recommendations ?? {
            opportunities: [],
            profile: { country: "Nigeria", age: 24, degree: "BSc" },
            engine: "hybrid_v2",
          },
        ),
    findAll: jest.fn().mockResolvedValue(options.fallback ?? []),
  };
  const repository = {
    listJourneysForUser: jest.fn().mockResolvedValue(options.existing ?? []),
    recordUserEvent: jest.fn().mockResolvedValue(undefined),
  };
  const intentService = {
    getCurrentIntent: jest.fn().mockResolvedValue(
      options.intent ?? {
        goalKey: "study_funding",
        opportunityTypes: ["scholarship"],
        locations: ["Nigeria", "Remote"],
        remotePreference: "preferred",
        actionHorizonDays: 90,
        weeklyHours: 4,
        readinessMode: "apply_now",
        source: "explicit",
        persisted: true,
      },
    ),
  };

  return {
    service: new OpportunityShortlistService(
      opportunitiesService as never,
      repository as never,
      intentService as never,
    ),
    opportunitiesService,
    repository,
  };
}

describe("OpportunityShortlistService", () => {
  it("returns three recommendations by default and never more than five", async () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      candidate({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title: `Opportunity ${index + 1}`,
        match: 90 - index,
      }),
    );
    const { service, opportunitiesService } = createService({
      recommendations: {
        opportunities: rows,
        profile: { country: "Nigeria" },
        engine: "hybrid_v2",
      },
    });

    await expect(service.getShortlist(USER_ID)).resolves.toMatchObject({
      degraded: false,
      recommendations: expect.arrayContaining([
        expect.objectContaining({ title: "Opportunity 1" }),
      ]),
    });
    expect((await service.getShortlist(USER_ID)).recommendations).toHaveLength(
      3,
    );
    expect(
      (await service.getShortlist(USER_ID, 99)).recommendations,
    ).toHaveLength(5);
    expect(
      opportunitiesService.getPersonalizedRecommendations,
    ).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ limit: 30, aiRerank: false }),
    );
  });

  it("excludes every opportunity already represented by a journey", async () => {
    const excludedId = "00000000-0000-4000-8000-000000000010";
    const { service, opportunitiesService } = createService({
      existing: [{ opportunityId: excludedId }],
      recommendations: {
        opportunities: [
          candidate({ id: excludedId, title: "Already tracked" }),
          candidate({
            id: "00000000-0000-4000-8000-000000000011",
            title: "New choice",
          }),
        ],
        profile: { country: "Nigeria" },
        engine: "heuristic_v1",
      },
    });

    const result = await service.getShortlist(USER_ID);
    expect(result.recommendations.map((item) => item.title)).toEqual([
      "New choice",
    ]);
    expect(
      opportunitiesService.getPersonalizedRecommendations,
    ).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ excludeOpportunityIds: [excludedId] }),
    );
  });

  it("removes explicit ineligibility from the focused shortlist", async () => {
    const { service } = createService({
      recommendations: {
        opportunities: [
          candidate({
            id: "00000000-0000-4000-8000-000000000020",
            title: "Wrong country",
            eligibility: { countries: ["Kenya"] },
            match: 98,
          }),
          candidate({
            id: "00000000-0000-4000-8000-000000000021",
            title: "Eligible option",
            eligibility: { countries: ["Nigeria"] },
            match: 75,
          }),
        ],
        profile: { country: "Nigeria", age: 24, degree: "BSc" },
        engine: "hybrid_v2",
      },
    });

    const result = await service.getShortlist(USER_ID);
    expect(result.recommendations.map((item) => item.title)).toEqual([
      "Eligible option",
    ]);
  });

  it("uses current intent as an additional ordering signal without replacing match", async () => {
    const { service } = createService({
      recommendations: {
        opportunities: [
          candidate({
            id: "00000000-0000-4000-8000-000000000030",
            title: "Generic high match",
            type: "job",
            category: "job",
            match: 88,
          }),
          candidate({
            id: "00000000-0000-4000-8000-000000000031",
            title: "Scholarship exact intent",
            type: "scholarship",
            category: "scholarship",
            match: 78,
          }),
        ],
        profile: { country: "Nigeria" },
        engine: "hybrid_v2",
      },
    });

    const result = await service.getShortlist(USER_ID);
    expect(result.recommendations[0]).toMatchObject({
      title: "Scholarship exact intent",
      matchScore: 78,
    });
  });

  it("returns a disclosed degraded fallback instead of an empty success", async () => {
    const { service, repository } = createService({
      recommendationError: new Error("recommender unavailable"),
      fallback: [
        candidate({
          id: "00000000-0000-4000-8000-000000000040",
          title: "Catalog fallback",
          eligibility: null,
          match: undefined,
        }),
      ],
    });

    await expect(service.getShortlist(USER_ID)).resolves.toMatchObject({
      degraded: true,
      degradedReasons: ["personalized_recommendations_unavailable"],
      recommendations: [expect.objectContaining({ title: "Catalog fallback" })],
    });
    expect(repository.recordUserEvent).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ eventType: "focused_shortlist_generated" }),
    );
  });
});
