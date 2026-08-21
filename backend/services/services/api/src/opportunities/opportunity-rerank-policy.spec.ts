import {
  blendOpportunityRerankScore,
  compactOpportunityForRerank,
} from "./opportunity-rerank-policy";

describe("opportunity rerank policy", () => {
  it("allows AI evidence to demote a soft heuristic score", () => {
    expect(blendOpportunityRerankScore(90, 20)).toBe(62);
  });

  it("allows AI evidence to promote a soft heuristic score", () => {
    expect(blendOpportunityRerankScore(40, 90)).toBe(60);
  });

  it("clamps both inputs and the final score to the public 0-100 range", () => {
    expect(blendOpportunityRerankScore(150, -20)).toBe(60);
    expect(blendOpportunityRerankScore(-50, 200)).toBe(40);
  });

  it("uses a compact normalized excerpt instead of full scraped descriptions", () => {
    const hiddenTail = "PROMPT-INJECTION-TAIL-SHOULD-NOT-REACH-RERANKER";
    const compact = compactOpportunityForRerank({
      id: "opp-1",
      title: "  Fully   Funded Scholarship  ",
      description: `${"A".repeat(500)} ${hiddenTail}`,
      category: "Scholarship",
      fundingType: "Fully funded",
      targetRegion: "Africa",
      match: 83,
    });

    expect(compact).toEqual(
      expect.objectContaining({
        id: "opp-1",
        title: "Fully Funded Scholarship",
        category: "Scholarship",
        fundingType: "Fully funded",
        targetRegion: "Africa",
        heuristicScore: 83,
      }),
    );
    expect(compact.summary.length).toBeLessThanOrEqual(320);
    expect(compact.summary).not.toContain(hiddenTail);
    expect(compact.summary).not.toMatch(/\s{2,}/);
  });

  it("does not manufacture text for missing optional fields", () => {
    expect(
      compactOpportunityForRerank({
        id: "opp-2",
        title: "Fellowship",
        description: null,
        category: null,
        fundingType: null,
        targetRegion: null,
        match: 50,
      }),
    ).toEqual({
      id: "opp-2",
      title: "Fellowship",
      summary: "",
      category: null,
      fundingType: null,
      targetRegion: null,
      heuristicScore: 50,
    });
  });
});
