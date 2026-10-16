import { describe, expect, it } from "vitest";
import type { Opportunity } from "../types/opportunity";
import { deduplicateOpportunities } from "./opportunityDeduplication";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opportunity-1",
    title: "WCSJ2027 Travel Fellowship",
    organization: "",
    category: "Fellowships",
    location: "",
    description: "Short description.",
    match: 0,
    requirements: [],
    benefits: [],
    applicationProcess: [],
    sourceUrl: "https://www.example.org/story/?utm_source=newsletter",
    applyUrl: "https://www.example.org/story/",
    deadline: "2026-10-23",
    ...overrides,
  };
}

describe("deduplicateOpportunities", () => {
  it("collapses repeated imports from the same canonical article and keeps the richer listing", () => {
    const shortImport = opportunity();
    const enrichedImport = opportunity({
      id: "opportunity-2",
      sourceUrl: "https://example.org/story",
      applyUrl: "https://apply.example.org/form",
      summary: "A verified travel fellowship for science journalists.",
      description: "A much more complete description. ".repeat(30),
      organization: "World Federation of Science Journalists",
    });

    const result = deduplicateOpportunities([shortImport, enrichedImport]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "opportunity-2",
      organization: "World Federation of Science Journalists",
      applyUrl: "https://apply.example.org/form",
    });
  });

  it("keeps same-title opportunities from different sources", () => {
    const first = opportunity();
    const second = opportunity({
      id: "opportunity-2",
      sourceUrl: "https://another.org/story",
    });

    expect(deduplicateOpportunities([first, second])).toHaveLength(2);
  });

  it("keeps unrelated titles from the same source", () => {
    const first = opportunity();
    const second = opportunity({ id: "opportunity-2", title: "Different award" });

    expect(deduplicateOpportunities([first, second])).toHaveLength(2);
  });

  it("removes a deadline when duplicate imports disagree and preserves a review signal", () => {
    const first = opportunity({ deadline: "2026-10-23" });
    const second = opportunity({
      id: "opportunity-2",
      deadline: "2026-10-30",
      description: "Longer description. ".repeat(30),
    });

    const [result] = deduplicateOpportunities([first, second]);

    expect(result.deadline).toBeNull();
    expect(result.trust?.deadlineNeedsReview).toBe(true);
  });

  it("keeps a known deadline when another duplicate omits it", () => {
    const dated = opportunity({ deadline: "2026-10-23" });
    const undated = opportunity({
      id: "opportunity-2",
      deadline: null,
      description: "Longer description. ".repeat(30),
      trust: {
        verificationStatus: "verified",
        lastVerifiedAt: null,
        deadlineConfidence: "unknown",
        deadlineNeedsReview: true,
        verificationMethod: null,
        sourceDomain: "example.org",
      },
    });

    const [result] = deduplicateOpportunities([dated, undated]);

    expect(result.deadline).toBe("2026-10-23");
    expect(result.trust?.deadlineNeedsReview).toBe(true);
  });

  it("does not collapse rows without a source URL because their identity is uncertain", () => {
    const first = opportunity({ sourceUrl: undefined });
    const second = opportunity({ id: "opportunity-2", sourceUrl: undefined });

    expect(deduplicateOpportunities([first, second])).toHaveLength(2);
  });
});
