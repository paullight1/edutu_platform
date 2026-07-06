import {
  DEFAULT_WEIGHTS,
  behaviorFromSignals,
  blendScore,
  deriveMatchReasons,
  freshnessScore,
  loadWeightsFromEnv,
  normalizeSemantic,
  normalizeWeights,
} from "./recommendation-blender";

describe("normalizeWeights", () => {
  it("renormalizes arbitrary positive weights to sum 1", () => {
    const w = normalizeWeights({
      semantic: 2,
      behavior: 1,
      profileFit: 1,
      freshness: 0,
    });
    expect(w.semantic).toBeCloseTo(0.5);
    expect(w.behavior).toBeCloseTo(0.25);
    expect(w.profileFit).toBeCloseTo(0.25);
    expect(w.freshness).toBeCloseTo(0);
    expect(w.semantic + w.behavior + w.profileFit + w.freshness).toBeCloseTo(1);
  });

  it("falls back to defaults for negative/missing entries", () => {
    const w = normalizeWeights({ semantic: -5 });
    expect(w.semantic).toBeCloseTo(DEFAULT_WEIGHTS.semantic);
  });
});

describe("loadWeightsFromEnv", () => {
  it("reads RECS_WEIGHT_* and renormalizes", () => {
    const w = loadWeightsFromEnv({
      RECS_WEIGHT_SEMANTIC: "0.5",
      RECS_WEIGHT_BEHAVIOR: "0.5",
      RECS_WEIGHT_PROFILE_FIT: "0",
      RECS_WEIGHT_FRESHNESS: "0",
    });
    expect(w.semantic).toBeCloseTo(0.5);
    expect(w.behavior).toBeCloseTo(0.5);
    expect(w.profileFit).toBeCloseTo(0);
  });

  it("ignores garbage env values", () => {
    const w = loadWeightsFromEnv({ RECS_WEIGHT_SEMANTIC: "banana" });
    expect(w.semantic).toBeCloseTo(
      DEFAULT_WEIGHTS.semantic /
        (DEFAULT_WEIGHTS.semantic +
          DEFAULT_WEIGHTS.behavior +
          DEFAULT_WEIGHTS.profileFit +
          DEFAULT_WEIGHTS.freshness),
    );
  });
});

describe("normalizeSemantic", () => {
  it("maps the useful cosine band onto 0..1", () => {
    expect(normalizeSemantic(0.5)).toBe(0);
    expect(normalizeSemantic(0.9)).toBe(1);
    expect(normalizeSemantic(0.7)).toBeCloseTo(0.5);
  });

  it("clamps out-of-band values", () => {
    expect(normalizeSemantic(0.1)).toBe(0);
    expect(normalizeSemantic(1.5)).toBe(1);
    expect(normalizeSemantic(Number.NaN)).toBe(0);
  });
});

describe("behaviorFromSignals", () => {
  it("is 0.3 for a neutral user (no signals, no affinity)", () => {
    // direct = (0+30)/60 = 0.5 → 0.6*0.5 + 0.4*0 = 0.3
    expect(behaviorFromSignals(0, 0)).toBeCloseTo(0.3);
  });

  it("maxes out with strong signals and affinity", () => {
    expect(behaviorFromSignals(30, 1)).toBeCloseTo(1);
  });

  it("clamps out-of-range signal scores", () => {
    expect(behaviorFromSignals(-999, 0)).toBeCloseTo(0);
    expect(behaviorFromSignals(999, 0)).toBeCloseTo(0.6);
  });
});

describe("freshnessScore", () => {
  const now = new Date("2026-07-06T12:00:00Z");

  it("rewards recently updated rows with a deadline in the sweet spot", () => {
    const updated = new Date("2026-07-05T12:00:00Z");
    const deadline = new Date("2026-07-30T12:00:00Z"); // 24 days out
    const score = freshnessScore(updated, deadline, now);
    expect(score).toBeGreaterThan(0.9);
  });

  it("scores a passed deadline near the recency floor", () => {
    const updated = new Date("2026-07-05T12:00:00Z");
    const deadline = new Date("2026-07-01T12:00:00Z");
    expect(freshnessScore(updated, deadline, now)).toBeLessThanOrEqual(0.5);
  });

  it("treats <3-day deadlines as risky-low", () => {
    const deadline = new Date("2026-07-08T12:00:00Z"); // 2 days
    const withImminent = freshnessScore(null, deadline, now);
    const withSweetSpot = freshnessScore(
      null,
      new Date("2026-07-26T12:00:00Z"),
      now,
    );
    expect(withImminent).toBeLessThan(withSweetSpot);
  });

  it("handles null inputs", () => {
    const score = freshnessScore(null, null, now);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("blendScore", () => {
  it("blends all four components when semantic is present", () => {
    const score = blendScore(
      { semantic: 1, behavior: 1, profileFit: 1, freshness: 1 },
      DEFAULT_WEIGHTS,
    );
    expect(score).toBe(100);
  });

  it("redistributes semantic weight pro-rata when semantic is null", () => {
    // With semantic null and equal remaining components, the result must be
    // identical to scoring those components alone.
    const withNull = blendScore(
      { semantic: null, behavior: 0.8, profileFit: 0.8, freshness: 0.8 },
      DEFAULT_WEIGHTS,
    );
    expect(withNull).toBe(80);
  });

  it("null-semantic scores stay comparable (not systematically deflated)", () => {
    const semanticized = blendScore(
      { semantic: 0.6, behavior: 0.6, profileFit: 0.6, freshness: 0.6 },
      DEFAULT_WEIGHTS,
    );
    const heuristic = blendScore(
      { semantic: null, behavior: 0.6, profileFit: 0.6, freshness: 0.6 },
      DEFAULT_WEIGHTS,
    );
    expect(heuristic).toBe(semanticized);
  });

  it("clamps to 0..100 integers", () => {
    expect(
      blendScore({ semantic: 2, behavior: 2, profileFit: 2, freshness: 2 }),
    ).toBe(100);
    expect(
      blendScore({ semantic: 0, behavior: 0, profileFit: 0, freshness: 0 }),
    ).toBe(0);
  });
});

describe("deriveMatchReasons", () => {
  it("leads with the semantic reason when similarity is strong", () => {
    const reasons = deriveMatchReasons(
      { semantic: 0.8, behavior: 0.3, profileFit: 0.5, freshness: 0.5 },
      ["Matches your interest in engineering"],
    );
    expect(reasons[0]).toBe("Strong fit with your profile and interests.");
    expect(reasons).toContain("Matches your interest in engineering");
  });

  it("adds the behavioral-affinity reason with a category", () => {
    const reasons = deriveMatchReasons(
      { semantic: null, behavior: 0.9, profileFit: 0.5, freshness: 0.5 },
      [],
      { categoryAffinity: 0.7, topCategory: "scholarships" },
    );
    expect(reasons[0]).toBe(
      "Because you engaged with similar scholarships opportunities.",
    );
  });

  it("appends deadline urgency inside the 3-21 day window", () => {
    const reasons = deriveMatchReasons(
      { semantic: null, behavior: 0.3, profileFit: 0.5, freshness: 0.5 },
      [],
      { daysToDeadline: 10 },
    );
    expect(reasons).toContain("Deadline in 10 days — apply soon.");
  });

  it("caps at 4 reasons and dedupes", () => {
    const reasons = deriveMatchReasons(
      { semantic: 0.9, behavior: 0.9, profileFit: 1, freshness: 1 },
      ["r1", "r1", "r2", "r3", "r4", "r5"],
      { categoryAffinity: 0.9, topCategory: "careers", daysToDeadline: 10 },
    );
    expect(reasons).toHaveLength(4);
    expect(new Set(reasons).size).toBe(4);
  });
});
