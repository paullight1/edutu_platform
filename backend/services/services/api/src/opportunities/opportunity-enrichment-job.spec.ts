import {
  enrichmentJobProgress,
  shouldSkipOpportunityEnhancement,
} from "./opportunity-enrichment-job";

describe("opportunity enrichment job contract", () => {
  const now = new Date("2026-08-11T12:00:00.000Z");

  it("skips a high-quality opportunity enhanced within the freshness window", () => {
    expect(
      shouldSkipOpportunityEnhancement(
        {
          quality_score: 82,
          metadata: { ai_improved_at: "2026-08-01T12:00:00.000Z" },
        },
        now,
      ),
    ).toBe(true);
  });

  it.each([
    ["stale", 82, "2026-06-01T12:00:00.000Z"],
    ["low quality", 69, "2026-08-10T12:00:00.000Z"],
    ["never enhanced", 90, undefined],
  ])("does not skip a %s opportunity", (_label, score, aiImprovedAt) => {
    expect(
      shouldSkipOpportunityEnhancement(
        {
          quality_score: score,
          metadata: { ai_improved_at: aiImprovedAt },
        },
        now,
      ),
    ).toBe(false);
  });

  it("derives bounded progress from persisted counters", () => {
    expect(
      enrichmentJobProgress({
        total: 100,
        completed: 37,
        skipped: 8,
        failed: 5,
      }),
    ).toEqual({ processed: 50, percent: 50, remaining: 50 });
  });
});
