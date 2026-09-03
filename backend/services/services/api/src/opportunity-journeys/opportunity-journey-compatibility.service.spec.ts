import { OpportunityJourneyCompatibilityService } from "./opportunity-journey-compatibility.service";

const USER_ID = "user_legacy";

function legacyStore(overrides: Record<string, unknown> = {}) {
  return {
    listBookmarks: jest.fn().mockResolvedValue([]),
    listApplications: jest.fn().mockResolvedValue([]),
    ensureBookmark: jest.fn().mockResolvedValue(undefined),
    ensureApplication: jest.fn().mockResolvedValue(undefined),
    listUserIds: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function repository(existing: Record<string, unknown> | null = null) {
  return {
    findJourneyByOpportunity: jest.fn().mockResolvedValue(existing),
    createOrReadJourney: jest.fn(async (input) => ({
      id: "journey-created",
      version: 1,
      ...input,
    })),
    updateJourneyVersioned: jest.fn(async (input) => ({
      id: input.journeyId,
      version: input.expectedVersion + 1,
      ...input.patch,
    })),
    listJourneysForUser: jest.fn().mockResolvedValue(existing ? [existing] : []),
  };
}

describe("OpportunityJourneyCompatibilityService", () => {
  it("maps a bookmark-only legacy record to shortlisted", async () => {
    const store = legacyStore({
      listBookmarks: jest.fn().mockResolvedValue([
        {
          id: "bookmark-1",
          opportunityId: "11111111-1111-4111-8111-111111111111",
          savedAt: "2026-08-01T00:00:00Z",
        },
      ]),
    });
    const repo = repository();
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await expect(service.reconcileUser(USER_ID)).resolves.toMatchObject({
      imported: 1,
      updated: 0,
      skipped: 0,
    });
    expect(repo.createOrReadJourney).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "shortlisted",
        priority: "none",
        idempotencyKey: "legacy-import-v1:bookmark:bookmark-1",
        source: "migration",
      }),
    );
  });

  it.each([
    ["draft", "preparing"],
    ["submitted", "applied"],
    ["interviewing", "interview"],
    ["interview", "interview"],
    ["offered", "offer"],
    ["offer", "offer"],
    ["rejected", "rejected"],
    ["withdrawn", "withdrawn"],
    ["no_response", "no_response"],
  ] as const)("maps application status %s to %s", async (status, state) => {
    const store = legacyStore({
      listApplications: jest.fn().mockResolvedValue([
        {
          id: "application-1",
          opportunityId: "11111111-1111-4111-8111-111111111111",
          status,
          submittedAt: "2026-08-02T00:00:00Z",
          updatedAt: "2026-08-03T00:00:00Z",
        },
      ]),
    });
    const repo = repository();
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await service.reconcileUser(USER_ID);
    expect(repo.createOrReadJourney).toHaveBeenCalledWith(
      expect.objectContaining({ state }),
    );
  });

  it("lets an application override a bookmark for the same opportunity", async () => {
    const opportunityId = "11111111-1111-4111-8111-111111111111";
    const store = legacyStore({
      listBookmarks: jest.fn().mockResolvedValue([
        { id: "bookmark-1", opportunityId },
      ]),
      listApplications: jest.fn().mockResolvedValue([
        { id: "application-1", opportunityId, status: "submitted" },
      ]),
    });
    const repo = repository();
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await service.reconcileUser(USER_ID);
    expect(repo.createOrReadJourney).toHaveBeenCalledTimes(1);
    expect(repo.createOrReadJourney).toHaveBeenCalledWith(
      expect.objectContaining({ state: "applied" }),
    );
  });

  it("does not downgrade a newer journey from an older legacy record", async () => {
    const current = {
      id: "journey-1",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      state: "interview",
      version: 4,
    };
    const store = legacyStore({
      listApplications: jest.fn().mockResolvedValue([
        {
          id: "application-1",
          opportunityId: current.opportunityId,
          status: "draft",
        },
      ]),
    });
    const repo = repository(current);
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await expect(service.reconcileUser(USER_ID)).resolves.toMatchObject({
      imported: 0,
      updated: 0,
      skipped: 1,
    });
    expect(repo.updateJourneyVersioned).not.toHaveBeenCalled();
  });

  it("upgrades a weaker journey idempotently without creating tasks", async () => {
    const current = {
      id: "journey-1",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      state: "shortlisted",
      version: 2,
    };
    const store = legacyStore({
      listApplications: jest.fn().mockResolvedValue([
        {
          id: "application-1",
          opportunityId: current.opportunityId,
          status: "submitted",
        },
      ]),
    });
    const repo = repository(current);
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await service.reconcileUser(USER_ID);
    expect(repo.updateJourneyVersioned).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        patch: expect.objectContaining({ state: "applied" }),
        idempotencyKey: "legacy-import-v1:application:application-1",
      }),
    );
  });

  it("mirrors active preparation to a legacy bookmark only", async () => {
    const store = legacyStore();
    const service = new OpportunityJourneyCompatibilityService(
      repository() as never,
      store as never,
    );

    await service.mirrorJourney(USER_ID, {
      id: "journey-1",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      state: "ready_to_apply",
    } as never);

    expect(store.ensureBookmark).toHaveBeenCalled();
    expect(store.ensureApplication).not.toHaveBeenCalled();
  });

  it("mirrors submitted and outcome states to legacy applications", async () => {
    const store = legacyStore();
    const service = new OpportunityJourneyCompatibilityService(
      repository() as never,
      store as never,
    );

    await service.mirrorJourney(USER_ID, {
      id: "journey-1",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      state: "offer",
      appliedAt: new Date("2026-08-02T00:00:00Z"),
    } as never);

    expect(store.ensureBookmark).toHaveBeenCalled();
    expect(store.ensureApplication).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ status: "offered" }),
    );
  });

  it("reports parity mismatches without mutating either model", async () => {
    const store = legacyStore({
      listApplications: jest.fn().mockResolvedValue([
        {
          id: "application-1",
          opportunityId: "11111111-1111-4111-8111-111111111111",
          status: "submitted",
        },
      ]),
    });
    const repo = repository({
      id: "journey-1",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      state: "shortlisted",
    });
    const service = new OpportunityJourneyCompatibilityService(
      repo as never,
      store as never,
    );

    await expect(service.auditUserParity(USER_ID)).resolves.toMatchObject({
      mismatches: [
        expect.objectContaining({
          expectedState: "applied",
          actualState: "shortlisted",
        }),
      ],
    });
    expect(repo.createOrReadJourney).not.toHaveBeenCalled();
    expect(repo.updateJourneyVersioned).not.toHaveBeenCalled();
  });
});
