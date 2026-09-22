import { OpportunityRankingService } from "./opportunity-ranking.service";

jest.mock("../db", () => ({ db: {} }));

describe("profile-led opportunity discovery", () => {
  function service() {
    const ranking = new OpportunityRankingService(
      {} as never,
      {
        getProfileEmbedding: async () => null,
      } as never,
    );
    const internals = ranking as any;
    jest.spyOn(internals, "fetchCandidateOpportunities").mockResolvedValue([
      {
        id: "unopened",
        title: "Robotics internship",
        applyUrl: "https://example.org/apply",
        description:
          "Build robotics with Python. Undergraduate students welcome. " +
          "Applications are reviewed by the programme team. ".repeat(4),
        category: "Internship",
      },
      {
        id: "opened",
        title: "Hospitality career",
        applyUrl: "https://example.org/hotel",
        description:
          "Hotel management placement. " +
          "Applications are reviewed by the programme team. ".repeat(4),
        category: "Career",
      },
    ]);
    jest.spyOn(internals, "getDismissedOpportunityIds").mockResolvedValue([]);
    jest
      .spyOn(internals, "getUserSignalScores")
      .mockResolvedValue(
        new Map([
          [
            "opened",
            { score: 30, positive: 30, negative: 0, counts: { view: 10 } },
          ],
        ]),
      );
    jest
      .spyOn(internals, "getUserCategoryAffinities")
      .mockResolvedValue(new Map());
    jest.spyOn(internals, "getGlobalEngagement").mockResolvedValue(new Map());
    return ranking;
  }

  it("finds an unopened opportunity using saved onboarding interests, skills, education and ambitions", async () => {
    const result = await service().queryRecommendations({
      userId: "member",
      profile: {
        preferences: {
          interests: ["robotics"],
          skills: ["Python"],
          pursuit: "robotics",
          educationLevel: "Undergraduate",
          ambitions: ["Get an internship"],
        },
      } as never,
    });
    const unopened = result.opportunities.find((row) => row.id === "unopened")!;
    const opened = result.opportunities.find((row) => row.id === "opened")!;
    expect(unopened.match_fit).toBeGreaterThan(opened.match_fit);
    expect(unopened.match_fit).toBe(58);
    expect(unopened.match_reason_details.map((reason) => reason.kind)).toEqual(
      expect.arrayContaining(["interest", "experience", "field", "education"]),
    );
  });

  it("still ranks suitable opportunities with no browsing history", async () => {
    const ranking = service();
    (ranking as any).getUserSignalScores.mockResolvedValue(new Map());
    const result = await ranking.queryRecommendations({
      userId: "new-member",
      profile: {
        preferences: { interests: ["robotics"], skills: ["Python"] },
      } as never,
    });
    expect(result.opportunities[0].id).toBe("unopened");
    expect(result.opportunities[0].match_fit).toBeGreaterThan(20);
  });
});
