import { installOpportunityRankingRuntimePolicy } from "./opportunity-ranking-runtime-policy";

describe("installOpportunityRankingRuntimePolicy", () => {
  it("replaces the legacy promote-only reranker with compact bidirectional scoring", async () => {
    const hiddenTail = "UNTRUSTED-PROMPT-TAIL-SHOULD-NOT-REACH-AI";
    const generateJson = jest.fn().mockResolvedValue({
      matches: [{ id: "opp-1", score: 20, reason: "Weak semantic fit." }],
    });
    const service = {
      aiService: { generateJson },
      logger: { warn: jest.fn() },
      rerankWithDeepSeek: jest.fn(() => {
        throw new Error("legacy reranker should be replaced");
      }),
    } as any;
    const candidates = [
      {
        id: "opp-1",
        title: "Scholarship",
        description: `${"A".repeat(500)} ${hiddenTail}`,
        category: "Scholarship",
        fundingType: "Fully funded",
        targetRegion: "Africa",
        match: 90,
        matchReasons: ["Strong heuristic fit."],
      },
    ];

    const restore = installOpportunityRankingRuntimePolicy(service);
    const result = await service.rerankWithDeepSeek(
      candidates,
      { country: "Nigeria" },
      null,
      [],
      "funded scholarship",
      5,
    );

    expect(result[0]).toMatchObject({
      id: "opp-1",
      match: 62,
      description: candidates[0].description,
      matchReasons: ["Weak semantic fit.", "Strong heuristic fit."],
    });
    const prompt = generateJson.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain(hiddenTail);
    expect(prompt.length).toBeLessThan(5000);
    restore();
  });

  it("fails soft to the deterministic shortlist when AI reranking is unavailable", async () => {
    const candidates = [
      {
        id: "one",
        title: "One",
        description: "A",
        match: 80,
        matchReasons: [],
      },
      {
        id: "two",
        title: "Two",
        description: "B",
        match: 70,
        matchReasons: [],
      },
    ];
    const service = {
      aiService: {
        generateJson: jest.fn().mockRejectedValue(new Error("down")),
      },
      logger: { warn: jest.fn() },
      rerankWithDeepSeek: jest.fn(),
    } as any;

    const restore = installOpportunityRankingRuntimePolicy(service);
    await expect(
      service.rerankWithDeepSeek(candidates, {}, null, [], "", 1),
    ).resolves.toEqual([candidates[0]]);
    expect(service.logger.warn).toHaveBeenCalled();
    restore();
  });
});
