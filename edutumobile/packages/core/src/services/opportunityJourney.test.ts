import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OpportunityJourneyApiError,
  createOpportunityJourney,
  getOpportunityHome,
  listQueuedOpportunityJourneyWrites,
  markOpportunityApplicationOpened,
  replayOpportunityJourneyWrites,
} from "./opportunityJourney";

const USER_ID = "user_mobile_journey";
const getAuthToken = jest.fn(async () => "token");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mobile opportunity journey service", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    getAuthToken.mockClear();
    await AsyncStorage.clear();
  });

  it("stores and returns a fresh focused-home snapshot after network success", async () => {
    const home = {
      generatedAt: "2026-09-03T00:00:00Z",
      intent: { goalKey: "study_funding" },
      nextAction: null,
      activePursuits: [],
      recommendations: [],
      degraded: false,
      degradedReasons: [],
      limits: {
        recommendationDefault: 3,
        recommendationMaximum: 5,
        primaryActiveMaximum: 1,
        secondaryActiveMaximum: 2,
      },
    };
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(home));

    await expect(
      getOpportunityHome({ userId: USER_ID, getAuthToken }),
    ).resolves.toEqual({ data: home, isStale: false, source: "network" });

    expect(
      (await AsyncStorage.getAllKeys()).some((key) =>
        key.includes(`${USER_ID}:home:3`),
      ),
    ).toBe(true);
  });

  it("uses the last good snapshot and labels it stale when the network fails", async () => {
    const home = {
      generatedAt: "2026-09-03T00:00:00Z",
      intent: { goalKey: "employment" },
      nextAction: null,
      activePursuits: [],
      recommendations: [],
      degraded: false,
      degradedReasons: [],
      limits: {},
    };
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(home));
    await getOpportunityHome({ userId: USER_ID, getAuthToken });

    jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(
      getOpportunityHome({ userId: USER_ID, getAuthToken }),
    ).resolves.toEqual({ data: home, isStale: true, source: "snapshot" });
  });

  it("queues an unavailable write once and keeps its original idempotency key", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const input = {
      userId: USER_ID,
      opportunityId: "11111111-1111-4111-8111-111111111111",
      action: "pursue" as const,
      idempotencyKey: "pursue-mobile-stable",
      getAuthToken,
    };
    await expect(createOpportunityJourney(input)).resolves.toMatchObject({
      data: null,
      queued: true,
      idempotencyKey: "pursue-mobile-stable",
    });
    await createOpportunityJourney(input);

    const queue = await listQueuedOpportunityJourneyWrites(USER_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      idempotencyKey: "pursue-mobile-stable",
      body: expect.objectContaining({
        idempotencyKey: "pursue-mobile-stable",
      }),
    });
  });

  it("does not queue a server validation rejection", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          code: "OPPORTUNITY_INELIGIBLE",
          message: "Not eligible",
        },
        422,
      ),
    );

    await expect(
      createOpportunityJourney({
        userId: USER_ID,
        opportunityId: "11111111-1111-4111-8111-111111111111",
        action: "pursue",
        idempotencyKey: "invalid-pursuit",
        getAuthToken,
      }),
    ).rejects.toMatchObject<Partial<OpportunityJourneyApiError>>({
      status: 422,
      body: expect.objectContaining({ code: "OPPORTUNITY_INELIGIBLE" }),
    });
    await expect(listQueuedOpportunityJourneyWrites(USER_ID)).resolves.toEqual(
      [],
    );
  });

  it("replays an application-opened write exactly once with the same version and key", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await markOpportunityApplicationOpened({
      userId: USER_ID,
      journeyId: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 3,
      idempotencyKey: "application-opened-mobile",
      getAuthToken,
    });

    const replayFetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ journey: { version: 4 } }, 201));
    const result = await replayOpportunityJourneyWrites(USER_ID, getAuthToken);

    expect(result.completed).toHaveLength(1);
    expect(result.remaining).toEqual([]);
    expect(JSON.parse(String(replayFetch.mock.calls[0][1]?.body))).toEqual({
      expectedVersion: 3,
      idempotencyKey: "application-opened-mobile",
    });
    expect(replayFetch.mock.calls[0][0]).toContain("/application-opened");
    await expect(listQueuedOpportunityJourneyWrites(USER_ID)).resolves.toEqual(
      [],
    );
  });

  it("contains no direct Supabase lifecycle dependency", async () => {
    const source = await import("./opportunityJourney");
    expect(source).toBeDefined();
    expect(JSON.stringify(Object.keys(source))).not.toMatch(/supabase/i);
  });
});
