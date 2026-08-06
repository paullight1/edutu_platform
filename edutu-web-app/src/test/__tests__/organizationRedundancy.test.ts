import { describe, expect, it } from "vitest";
import {
  isPlaceholderOrganization,
  isRedundantOrganization,
  organizationLabel,
} from "../../lib/organizationLabel";

/**
 * The scraper derives `organization` by cutting the title at a keyword
 * ("Scholarship", "Internship", "Program"...), so half of the active rows store
 * an org that is literally a prefix of their own title. Rendering both puts the
 * same words on screen twice.
 *
 * Even a *correct* org trips this — "Mastercard Foundation" is a real
 * organisation, and "Mastercard Foundation Scholarship Program at the
 * University of Pretoria" still repeats it. The org line only earns its space
 * when it says something the title doesn't.
 */
describe("isRedundantOrganization", () => {
  it("rejects an org that is a prefix of the title", () => {
    expect(
      isRedundantOrganization(
        "Mastercard Foundation",
        "Mastercard Foundation Scholarship Program at the University of Pretoria 2026",
      ),
    ).toBe(true);
  });

  it("rejects scraper junk cut mid-phrase", () => {
    expect(
      isRedundantOrganization(
        "Fully",
        "Fully Funded Masters Scholarship in Canada (The MacBain Scholarship 2026)",
      ),
    ).toBe(true);
    expect(
      isRedundantOrganization("2027 RAVE", "2027 RAVE Scholarship in Germany"),
    ).toBe(true);
    expect(
      isRedundantOrganization(
        "PremiumTrust Bank Graduate Trainee",
        "PremiumTrust Bank Graduate Trainee Program 2026",
      ),
    ).toBe(true);
  });

  it("rejects an org appearing anywhere in the title, not just the start", () => {
    expect(
      isRedundantOrganization(
        "University of Pretoria",
        "Mastercard Foundation Scholarship Program at the University of Pretoria 2026",
      ),
    ).toBe(true);
  });

  it("ignores case, punctuation and spacing differences", () => {
    expect(
      isRedundantOrganization(
        "product hub africa (pha)",
        "Product Hub Africa (PHA) 2024 Bootcamp Training Program",
      ),
    ).toBe(true);
    expect(
      isRedundantOrganization("D.A.A.D.", "DAAD Masters Scholarship 2026"),
    ).toBe(true);
  });

  it("keeps an org that genuinely adds information", () => {
    expect(
      isRedundantOrganization("Chevening", "UK Government Scholarships 2026"),
    ).toBe(false);
    expect(
      isRedundantOrganization(
        "African Leadership Academy",
        "Anzisha Prize 2026 for Young Entrepreneurs",
      ),
    ).toBe(false);
  });

  it("treats a blank org as nothing to show", () => {
    expect(isRedundantOrganization("", "Some Scholarship 2026")).toBe(true);
    expect(isRedundantOrganization("   ", "Some Scholarship 2026")).toBe(true);
  });

  it("does not match a short org on a coincidental substring", () => {
    // "AI" must not be swallowed by the "ai" inside "Trainee"/"Chair".
    expect(
      isRedundantOrganization("AI", "Graduate Trainee Chair Programme 2026"),
    ).toBe(false);
  });
});

/**
 * `cleanOpportunityText` rewrites aggregator brand names to the literal phrase
 * "the official organizer" so competitors aren't advertised. That reads fine
 * mid-sentence but names nobody as a standalone field — 33 active rows carry
 * it, plus 22 with the scraper's "Program Organizer".
 */
describe("isPlaceholderOrganization", () => {
  it("catches the sanitiser's brand-replacement phrase", () => {
    expect(isPlaceholderOrganization("the official organizer")).toBe(true);
    expect(isPlaceholderOrganization("The Official Organizer")).toBe(true);
    expect(isPlaceholderOrganization("the official organiser")).toBe(true);
  });

  it("catches scraper filler and empty markers", () => {
    expect(isPlaceholderOrganization("Program Organizer")).toBe(true);
    expect(isPlaceholderOrganization("N/A")).toBe(true);
    expect(isPlaceholderOrganization("Unknown")).toBe(true);
  });

  it("keeps a real body whose name merely contains a placeholder word", () => {
    expect(isPlaceholderOrganization("Organizer Collective Nigeria")).toBe(
      false,
    );
    expect(isPlaceholderOrganization("Mastercard Foundation")).toBe(false);
  });
});

describe("organizationLabel", () => {
  it("drops both junk classes and keeps genuine orgs", () => {
    // Redundant with the title.
    expect(
      organizationLabel("Fully", "Fully Funded Masters Scholarship in Canada"),
    ).toBe("");
    // Names nobody.
    expect(
      organizationLabel("the official organizer", "Australia Scholarships"),
    ).toBe("");
    // Genuinely additive — expands an acronym the title only abbreviates.
    expect(
      organizationLabel(
        "International Monetary Fund (IMF)",
        "IMF Research Analyst Program 2026",
      ),
    ).toBe("International Monetary Fund (IMF)");
  });

  it("trims surrounding whitespace on a kept value", () => {
    expect(organizationLabel("  Chevening  ", "UK Scholarships 2026")).toBe(
      "Chevening",
    );
  });
});
