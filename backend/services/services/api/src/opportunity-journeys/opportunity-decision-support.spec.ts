import { buildOpportunityDecisionSupport } from "./opportunity-decision-support";

describe("buildOpportunityDecisionSupport", () => {
  const common = {
    matchScore: 84,
    matchReasons: ["Matches your field", "Available remotely", "Extra reason"],
    matchRisks: ["Requires two references", "Deadline is close", "Extra risk"],
    deadline: new Date("2026-11-01T00:00:00Z"),
  };

  it("classifies explicit blockers as ineligible", () => {
    const result = buildOpportunityDecisionSupport({
      ...common,
      eligibility: { countries: ["Kenya"] },
      profile: { country: "Nigeria", age: 24, degree: "Bachelor" },
    });

    expect(result.eligibilityStatus).toBe("ineligible");
    expect(result.eligibilityConfidence).toBeGreaterThanOrEqual(0.9);
    expect(result.eligibilityBlockers).not.toHaveLength(0);
  });

  it("does not claim eligibility when no structured rules exist", () => {
    const result = buildOpportunityDecisionSupport({
      ...common,
      eligibility: null,
      profile: { country: "Nigeria", age: 24, degree: "Bachelor" },
    });

    expect(result.eligibilityStatus).toBe("unclear");
    expect(result.eligibilityReasons).toEqual([
      "Eligibility must be confirmed from the official opportunity details.",
    ]);
  });

  it("classifies a complete matching profile as eligible", () => {
    const result = buildOpportunityDecisionSupport({
      ...common,
      eligibility: {
        countries: ["Nigeria", "Ghana"],
        age_min: 18,
        age_max: 35,
        degree_levels: ["bachelor"],
      },
      profile: { country: "Nigeria", age: 24, degree: "BSc" },
    });

    expect(result.eligibilityStatus).toBe("eligible");
    expect(result.eligibilityConfidence).toBe(1);
    expect(result.eligibilityBlockers).toEqual([]);
  });

  it("classifies missing required profile evidence as likely rather than eligible", () => {
    const result = buildOpportunityDecisionSupport({
      ...common,
      eligibility: {
        countries: ["Nigeria"],
        age_min: 18,
        degree_levels: ["bachelor"],
      },
      profile: { country: "Nigeria" },
    });

    expect(result.eligibilityStatus).toBe("likely");
    expect(result.eligibilityConfidence).toBeLessThan(1);
    expect(result.eligibilityReasons.join(" ")).toMatch(/confirm/i);
  });

  it("caps focused-card reasons and risks while preserving the match score", () => {
    const result = buildOpportunityDecisionSupport({
      ...common,
      eligibility: { unrestricted: true },
      profile: {},
    });

    expect(result.matchScore).toBe(84);
    expect(result.matchReasons).toEqual([
      "Matches your field",
      "Available remotely",
    ]);
    expect(result.matchRisks).toEqual([
      "Requires two references",
      "Deadline is close",
    ]);
  });
});
