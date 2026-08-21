import { describe, expect, it } from "vitest";
import {
  BULK_MOVE_CATEGORIES,
  buildOpportunityPayload,
  chunkArray,
  formatEligibilityCriteria,
  guessTitleFromUrl,
  mapPreviewToFormValues,
  normalizeOpportunityStatus,
  normalizeText,
  truncateText,
  type OpportunityFormValues,
} from "./opportunity-domain";

describe("opportunity admin domain helpers", () => {
  it("preserves bulk batching semantics", () => {
    expect(chunkArray(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(BULK_MOVE_CATEGORIES).toContain("Scholarships");
    expect(BULK_MOVE_CATEGORIES).toContain("Events");
  });

  it("normalizes backend and confidence statuses exactly as the page does", () => {
    expect(normalizeOpportunityStatus("pending", 99)).toBe("pending_review");
    expect(normalizeOpportunityStatus("expired", 99)).toBe("closed");
    expect(normalizeOpportunityStatus(" ACTIVE ", 0)).toBe("active");
    expect(normalizeOpportunityStatus("unknown", 60)).toBe("active");
    expect(normalizeOpportunityStatus("unknown", 59)).toBe("pending_review");
    expect(normalizeOpportunityStatus(undefined, undefined)).toBe("pending_review");
  });

  it("keeps text cleanup and URL title inference stable", () => {
    expect(normalizeText("  Global   Scholars  ")).toBe("Global Scholars");
    expect(normalizeText(null, "fallback")).toBe("fallback");
    expect(truncateText("abcdefghij", 7)).toBe("abcdef...");
    expect(
      guessTitleFromUrl("https://example.org/opportunities/global-leaders-2026"),
    ).toBe("Global Leaders 2026");
  });

  it("formats eligibility without inventing missing criteria", () => {
    expect(
      formatEligibilityCriteria({
        school: "Any University",
        major: "Computer Science",
        min_cgpa: "3.5",
        countries: ["Nigeria", "Ghana"],
      }),
    ).toBe(
      "School: Any University | Major: Computer Science | Minimum CGPA: 3.5 | Countries: Nigeria, Ghana",
    );
    expect(
      formatEligibilityCriteria({
        school: "",
        major: "",
        min_cgpa: "",
        countries: [],
      }),
    ).toBeNull();
  });

  it("maps scraper previews into the existing admin form shape", () => {
    const fallback: OpportunityFormValues = {
      title: "Fallback",
      summary: "Existing summary",
      description: "",
      category: "Scholarships",
      organization: "Existing Org",
      location: "Lagos",
      is_remote: false,
      application_url: "https://fallback.example/apply",
      close_date: "",
      image_url: "",
      is_featured: false,
      status: "draft",
      eligibility: {
        school: "",
        major: "",
        min_cgpa: "",
        countries: [],
      },
    };

    expect(
      mapPreviewToFormValues(
        {
          title: "Global Fellowship",
          source: "Example Foundation",
          application_url: "https://example.org/apply",
          close_date: "2026-12-31T23:59:59Z",
          confidence: 72,
          eligibility: { min_cgpa: 3.2, countries: ["Nigeria"] },
        },
        fallback,
      ),
    ).toMatchObject({
      title: "Global Fellowship",
      summary: "Existing summary",
      organization: "Example Foundation",
      location: "Lagos",
      application_url: "https://example.org/apply",
      close_date: "2026-12-31",
      status: "active",
      eligibility: { min_cgpa: "3.2", countries: ["Nigeria"] },
    });
  });

  it("builds the same backend payload for manual and preview data", () => {
    const input: OpportunityFormValues = {
      title: "AI Fellowship",
      summary: "Build useful AI systems",
      description: "Full details",
      category: "Fellowships",
      organization: "Edutu Labs",
      location: "Remote",
      is_remote: false,
      application_url: "https://example.org/apply",
      close_date: "2026-10-01",
      image_url: "https://example.org/image.png",
      is_featured: true,
      status: "pending_review",
      eligibility: {
        school: "Any University",
        major: "Computer Science",
        min_cgpa: "3.0",
        countries: ["Nigeria"],
      },
    };

    expect(buildOpportunityPayload(input)).toMatchObject({
      title: "AI Fellowship",
      category: "Fellowships",
      organization: "Edutu Labs",
      location: "Remote",
      deadline: "2026-10-01",
      sourceUrl: "https://example.org/apply",
      applyUrl: "https://example.org/apply",
      imageUrl: "https://example.org/image.png",
      isFeatured: true,
      isRemote: false,
      status: "pending_review",
      eligibilityCriteria:
        "School: Any University | Major: Computer Science | Minimum CGPA: 3.0 | Countries: Nigeria",
    });
  });
});
