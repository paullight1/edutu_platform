import {
  normalizeOpportunityDescription,
  normalizeOpportunitySummary,
} from "./opportunity-content-normalization.util";

describe("opportunity content normalization", () => {
  it("uses a factual description sentence when the summary is missing", () => {
    expect(
      normalizeOpportunitySummary(
        null,
        "This fellowship supports students with training and mentorship. More detail follows.",
        "Fellowship",
      ),
    ).toBe("This fellowship supports students with training and mentorship.");
  });

  it("does not turn placeholder text into learner-facing copy", () => {
    expect(normalizeOpportunitySummary("Unknown", null, "Scholarship")).toBe(
      "Scholarship.",
    );
    expect(normalizeOpportunityDescription("Not provided")).toBe("");
  });
});
