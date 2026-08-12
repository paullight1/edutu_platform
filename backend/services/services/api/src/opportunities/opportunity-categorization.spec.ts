import {
  classifyOpportunity,
  categorizeOpportunity,
  normalizeCategory,
} from "./opportunity-categorization";

describe("opportunity categorization", () => {
  it.each([
    ["Mastercard Scholars Scholarship", "scholarships"],
    ["Product Design Internship", "internships"],
    ["Youth Leadership Program", "programs"],
    ["Global Leadership Fellowship", "fellowships"],
    ["Women Founder Grant", "grants"],
    ["MSc Data Science Admission", "graduate_programs"],
    ["Frontend Engineering Bootcamp", "bootcamps"],
    ["African Youth Summit", "events"],
  ] as const)("classifies %s as %s", (title, expected) => {
    expect(categorizeOpportunity({ title })).toBe(expected);
  });

  it("uses a source category as strong evidence without blindly preserving stale output", () => {
    const result = classifyOpportunity({
      category: "Internships",
      canonical_category: "scholarships",
      title: "Product Design Internship",
    });

    expect(result.canonicalCategory).toBe("internships");
    expect(result.source).toBe("source");
    expect(result.matchedSignals).toEqual(
      expect.arrayContaining(["source category: internships"]),
    );
  });

  it("reports rules as the provenance when a precise title corrects a source label", () => {
    const result = classifyOpportunity({
      category: "Grants",
      title: "Fully Funded Scholarship",
    });

    expect(result.canonicalCategory).toBe("scholarships");
    expect(result.source).toBe("rules");
  });

  it("only preserves a stored category when it is explicitly locked", () => {
    expect(
      categorizeOpportunity({
        canonical_category: "internships",
        classification_locked: true,
        title: "Fully Funded PhD Scholarship",
      }),
    ).toBe("internships");

    expect(
      categorizeOpportunity({
        canonical_category: "internships",
        title: "Fully Funded PhD Scholarship",
      }),
    ).toBe("scholarships");
  });

  it("normalizes legacy labels to the eight-category vocabulary", () => {
    expect(normalizeCategory("careers")).toBe("internships");
    expect(normalizeCategory("global_programs")).toBe("programs");
    expect(normalizeCategory("training_conferences")).toBe("events");
    expect(normalizeCategory("competitions")).toBe("programs");
  });

  it("keeps ambiguous records visible but flags them for review", () => {
    const result = classifyOpportunity({ title: "Opportunity update" });
    expect(result.canonicalCategory).toBe("other");
    expect(result.needsReview).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });
});
