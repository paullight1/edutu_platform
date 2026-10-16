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
      matchReasons: ["Strong heuristic fit."],
    });
    const prompt = generateJson.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain(hiddenTail);
    expect(prompt.length).toBeLessThan(5000);
    restore();
  });

  it("rejects fabricated IDs, bad scores, and unsupported AI explanations", async () => {
    const generateJson = jest.fn().mockResolvedValue({
      matches: [
        { id: "unknown-opp", score: 100, reason: "Guaranteed scholarship." },
        { id: "one", score: "100", reason: "Guaranteed admission." },
        { id: "one", score: Number.NaN, reason: "Guaranteed admission." },
        { id: "two", score: -5, reason: "Guaranteed admission." },
        { id: "one", score: 20, reason: "Guaranteed admission." },
      ],
    });
    const service = {
      aiService: { generateJson },
      logger: { warn: jest.fn() },
      rerankWithDeepSeek: jest.fn(),
    } as any;
    const candidates = [
      { id: "one", title: "Scholarship", match: 90, matchReasons: ["Matches your subject."] },
      { id: "two", title: "Fellowship", match: 70, matchReasons: ["Matches your country."] },
    ];
    const restore = installOpportunityRankingRuntimePolicy(service);
    try {
      const result = await service.rerankWithDeepSeek(candidates, {}, null, [], "", 5);
      expect(result).toHaveLength(2);
      expect(result.find((entry: any) => entry.id === "one")).toMatchObject({
        match: 62,
        matchReasons: ["Matches your subject."],
      });
      expect(result.find((entry: any) => entry.id === "two")).toMatchObject({
        match: 70,
        matchReasons: ["Matches your country."],
      });
      expect(JSON.stringify(result)).not.toContain("Guaranteed");
    } finally {
      restore();
    }
  });

  it("fails soft when the model returns an invalid matches envelope", async () => {
    const service = {
      aiService: { generateJson: jest.fn().mockResolvedValue({ matches: "bad output" }) },
      logger: { warn: jest.fn() },
      rerankWithDeepSeek: jest.fn(),
    } as any;
    const candidates = [{ id: "one", title: "One", match: 80, matchReasons: [] }];
    const restore = installOpportunityRankingRuntimePolicy(service);
    try {
      await expect(service.rerankWithDeepSeek(candidates, {}, null, [], "", 5))
        .resolves.toEqual(candidates);
    } finally {
      restore();
    }
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
