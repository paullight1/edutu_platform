import { OpportunityRankingService } from "./opportunity-ranking.service";

describe("OpportunityRankingService request deduplication", () => {
  it("shares one in-flight personalized ranking for identical user requests", async () => {
    const service = new OpportunityRankingService({} as never, {} as never);
    jest
      .spyOn(service as any, "getUserProfile")
      .mockResolvedValue({ country: "NG" });
    jest.spyOn(service, "getUserPreferences").mockResolvedValue(null);
    jest.spyOn(service as any, "getUserGoals").mockResolvedValue([]);

    let resolveRanking!: (value: unknown) => void;
    const rankingResponse = new Promise((resolve) => {
      resolveRanking = resolve;
    });
    const queryRecommendations = jest
      .spyOn(service, "queryRecommendations")
      .mockReturnValue(rankingResponse as never);
    const request = { limit: 48, minMatchScore: 0, aiRerank: false };

    const first = service.getRecommendationsForUser("user-1", request);
    const second = service.getRecommendationsForUser("user-1", request);

    await Promise.resolve();
    await Promise.resolve();
    expect(queryRecommendations).toHaveBeenCalledTimes(1);

    resolveRanking({
      opportunities: [],
      profile: {},
      preferences: null,
      count: 0,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { opportunities: [], profile: {}, preferences: null, count: 0 },
      { opportunities: [], profile: {}, preferences: null, count: 0 },
    ]);
  });
});
