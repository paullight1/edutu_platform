import { installOpportunityContentRefinementPolicy } from "./opportunity-content-refinement-policy";

describe("opportunity content refinement policy", () => {
  it("routes existing enhance and backfill methods through the refiner and restores them", async () => {
    const originalCalls: string[] = [];
    const service = {
      async enhanceOpportunity(id: string) {
        originalCalls.push(`original:${id}`);
        return { success: true, id };
      },
      async backfillEnrichment(options: { limit?: number } = {}) {
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
    expect(originalCalls).toEqual([
      "original:opp-1",
      "original:from-backfill",
    ]);

    restore();
    expect(service.enhanceOpportunity).toBe(originalEnhance);
    expect(service.backfillEnrichment).toBe(originalBackfill);
  });
});
