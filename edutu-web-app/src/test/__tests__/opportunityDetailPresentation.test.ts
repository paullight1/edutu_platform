import { describe, expect, it } from "vitest";
import { prepareOpportunityDescription } from "../../lib/opportunityDetailPresentation";

describe("prepareOpportunityDescription", () => {
  it("prefers the clean summary when the scraped long description is navigation noise", () => {
    const result = prepareOpportunityDescription({
      summary:
        "The Human Rights Scholarship supports graduate researchers working in human rights at the University of Melbourne.",
      description:
        "Skip to content Category: Masters scholarships University of Melbourne Human Rights Scholarships 2027 in Australia October 31, 2026 Fully funded Melbourne Graduate Research Scholarships in Australia 2026-27 October 31, 2026 Fully funded",
    });

    expect(result).toEqual([
      "The Human Rights Scholarship supports graduate researchers working in human rights at the University of Melbourne.",
    ]);
  });

  it("rejects navigation-only source copy when no trustworthy summary exists", () => {
    const result = prepareOpportunityDescription({
      description:
        "Skip to content Category: Masters scholarships University of Melbourne Human Rights Scholarships 2027 in Australia October 31, 2026 Fully funded Melbourne Graduate Research Scholarships in Australia 2026-27 October 31, 2026 Fully funded",
    });

    expect(result).toEqual([]);
  });

  it("keeps useful paragraph structure and removes source navigation labels", () => {
    const result = prepareOpportunityDescription({
      description:
        "Skip to content\n\nOverview paragraph.\n\nWho can apply:\n- Current students\n- Recent graduates\n\nApply before the deadline.",
    });

    expect(result).toEqual([
      "Overview paragraph.",
      "Who can apply:\n- Current students\n- Recent graduates",
      "Apply before the deadline.",
    ]);
  });
});
