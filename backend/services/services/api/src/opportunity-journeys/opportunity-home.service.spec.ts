import { OpportunityHomeService } from "./opportunity-home.service";

const USER_ID = "user_home";

describe("OpportunityHomeService", () => {
  it("returns current intent, one next action, active pursuits, and three recommendations", async () => {
    const intentService = {
      getCurrentIntent: jest.fn().mockResolvedValue({
        goalKey: "study_funding",
        source: "explicit",
      }),
    };
    const journeysService = {
      listJourneys: jest.fn().mockResolvedValue([
        {
          journey: { id: "journey-1", state: "preparing" },
          nextAction: {
            key: "continue_task",
            label: "Collect transcript",
          },
        },
        {
          journey: { id: "journey-2", state: "ready_to_apply" },
          nextAction: { key: "open_application", label: "Open application" },
        },
      ]),
    };
    const shortlistService = {
      getShortlist: jest.fn().mockResolvedValue({
        batchId: "batch-1",
        degraded: false,
        degradedReasons: [],
        recommendations: [{ id: "1" }, { id: "2" }, { id: "3" }],
      }),
    };
    const service = new OpportunityHomeService(
      intentService as never,
      journeysService as never,
      shortlistService as never,
    );

    const result = await service.getHome(USER_ID);

    expect(result).toMatchObject({
      intent: { goalKey: "study_funding" },
      nextAction: { key: "continue_task", label: "Collect transcript" },
      limits: {
        recommendationDefault: 3,
        recommendationMaximum: 5,
        primaryActiveMaximum: 1,
        secondaryActiveMaximum: 2,
      },
    });
    expect(result.activePursuits).toHaveLength(2);
    expect(result.recommendations).toHaveLength(3);
    expect(shortlistService.getShortlist).toHaveBeenCalledWith(USER_ID, 3);
  });

  it("clamps the home recommendation limit to five", async () => {
    const service = new OpportunityHomeService(
      { getCurrentIntent: jest.fn().mockResolvedValue({}) } as never,
      { listJourneys: jest.fn().mockResolvedValue([]) } as never,
      {
        getShortlist: jest.fn().mockResolvedValue({
          recommendations: [],
          degraded: false,
          degradedReasons: [],
        }),
      } as never,
    );

    await service.getHome(USER_ID, 100);
    expect((service as any).shortlistService.getShortlist).toHaveBeenCalledWith(
      USER_ID,
      5,
    );
  });

  it("keeps active guidance available when recommendations degrade", async () => {
    const service = new OpportunityHomeService(
      { getCurrentIntent: jest.fn().mockResolvedValue({ source: "inferred" }) } as never,
      {
        listJourneys: jest.fn().mockResolvedValue([
          {
            journey: { id: "journey-1" },
            nextAction: { key: "continue_task", label: "Request reference" },
          },
        ]),
      } as never,
      {
        getShortlist: jest.fn().mockResolvedValue({
          recommendations: [],
          degraded: true,
          degradedReasons: ["personalized_recommendations_unavailable"],
        }),
      } as never,
    );

    await expect(service.getHome(USER_ID)).resolves.toMatchObject({
      nextAction: { label: "Request reference" },
      degraded: true,
      degradedReasons: ["personalized_recommendations_unavailable"],
    });
  });
});
