import { installOpportunityContentRefinementPolicy } from "./opportunity-content-refinement-policy";

describe("opportunity content refinement policy", () => {
  it("routes existing enhance and backfill methods through the refiner and restores them", async () => {
    const originalCalls: string[] = [];
    const service = {
      runOpportunityEnhancementExclusive: jest.fn(
        async <T>(operation: () => Promise<T>) => operation(),
      ),
      enhanceOpportunity: async (id: string) => {
        originalCalls.push(`original:${id}`);
        return { success: true, id };
      },
      backfillEnrichment: async (options: { limit?: number } = {}) => {
        return { processed: options.limit ?? 0 };
      },
    };
    const originalEnhance = service.enhanceOpportunity;
    const originalBackfill = service.backfillEnrichment;

    const refiner = {
      async refineOpportunity(
        id: string,
        options: { aiEnhance: (id: string) => Promise<unknown> },
      ) {
        const upstream = await options.aiEnhance(id);
        return { success: true, id, upstream };
      },
      async backfill(
        options: { limit?: number },
        hooks: { aiEnhance: (id: string) => Promise<unknown> },
      ) {
        await hooks.aiEnhance("from-backfill");
        return { processed: options.limit ?? 0, enhanced: 1, failed: 0 };
      },
    };

    const restore = installOpportunityContentRefinementPolicy(
      service as never,
      refiner as never,
    );

    await expect(service.enhanceOpportunity("opp-1")).resolves.toEqual({
      success: true,
      id: "opp-1",
      upstream: { success: true, id: "opp-1" },
    });
    await expect(service.backfillEnrichment({ limit: 3 })).resolves.toEqual({
      processed: 3,
      enhanced: 1,
      failed: 0,
    });
    expect(originalCalls).toEqual(["original:opp-1", "original:from-backfill"]);
    expect(service.runOpportunityEnhancementExclusive).toHaveBeenCalledTimes(2);

    restore();
    expect(service.enhanceOpportunity).toBe(originalEnhance);
    expect(service.backfillEnrichment).toBe(originalBackfill);
  });

  it("shares one in-flight enhancement when requests target the same opportunity", async () => {
    let originalCalls = 0;
    let releaseEnhancement!: () => void;
    const enhancementGate = new Promise<void>((resolve) => {
      releaseEnhancement = resolve;
    });
    const service = {
      runOpportunityEnhancementExclusive: async <T>(
        operation: () => Promise<T>,
      ) => operation(),
      enhanceOpportunity: async (id: string) => {
        originalCalls += 1;
        await enhancementGate;
        return { success: true, id };
      },
      backfillEnrichment: async () => ({ processed: 0 }),
    };
    const refiner = {
      async refineOpportunity(
        id: string,
        options: { aiEnhance: (id: string) => Promise<unknown> },
      ) {
        const upstream = await options.aiEnhance(id);
        return { success: true, id, upstream };
      },
      async backfill() {
        return { processed: 0, enhanced: 0, failed: 0 };
      },
    };

    const restore = installOpportunityContentRefinementPolicy(
      service as never,
      refiner as never,
    );
    const first = service.enhanceOpportunity("opp-shared");
    const second = service.enhanceOpportunity("opp-shared");

    await Promise.resolve();
    await Promise.resolve();
    const callsBeforeRelease = originalCalls;
    releaseEnhancement();

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        success: true,
        id: "opp-shared",
        upstream: { success: true, id: "opp-shared" },
      },
      {
        success: true,
        id: "opp-shared",
        upstream: { success: true, id: "opp-shared" },
      },
    ]);
    expect(callsBeforeRelease).toBe(1);
    expect(originalCalls).toBe(1);
    restore();
  });
});
