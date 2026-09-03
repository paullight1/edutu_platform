import { OpportunityHomeService } from "./opportunity-home.service";
import { OpportunityJourneyCacheService } from "./opportunity-journey-cache.service";

describe("opportunity journey home cache", () => {
  it("reconciles legacy state before serving a user-scoped cached home", async () => {
    const order: string[] = [];
    const compatibility = {
      reconcileUser: jest.fn(async () => {
        order.push("reconcile");
      }),
    };
    const cache = {
      wrapHome: jest.fn(async (_userId, _limit, producer) => {
        order.push("cache");
        return producer();
      }),
    };
    const service = new OpportunityHomeService(
      {
        getCurrentIntent: jest.fn(async () => {
          order.push("intent");
          return { goalKey: "study_funding" };
        }),
      } as never,
      {
        listJourneys: jest.fn(async () => {
          order.push("journeys");
          return [];
        }),
      } as never,
      {
        getShortlist: jest.fn(async () => {
          order.push("shortlist");
          return {
            recommendations: [],
            degraded: false,
            degradedReasons: [],
          };
        }),
      } as never,
      compatibility as never,
      cache as never,
    );

    await service.getHome("user_cache", 3);

    expect(order[0]).toBe("reconcile");
    expect(order[1]).toBe("cache");
    expect(cache.wrapHome).toHaveBeenCalledWith(
      "user_cache",
      3,
      expect.any(Function),
    );
  });

  it("uses the cache service prefix to invalidate every home variant", async () => {
    const cache = {
      wrap: jest.fn(),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OpportunityJourneyCacheService(cache as never);

    await service.invalidateUser("user_cache");

    expect(cache.delByPrefix).toHaveBeenCalledWith(
      expect.stringMatching(/^opportunity-pipeline:[0-9a-f-]+:$/),
    );
  });
});
