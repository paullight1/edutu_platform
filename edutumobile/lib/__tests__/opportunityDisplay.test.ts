import {
  cleanOpportunityListForDisplay,
  cleanOpportunityNarrative,
  needsProgressiveDisclosure,
  previewText,
  shouldShowOpportunitySummary,
} from "../opportunityDisplay";

describe("opportunity display cleanup", () => {
  it("removes advert and CTA noise while keeping readable paragraphs", () => {
    const cleaned = cleanOpportunityNarrative(`
      Advertisement
      The programme supports entrepreneurs with practical business training. Participants learn how to improve operations and profitability.
      Apply now
      https://example.org/apply
      The programme runs from 27 to 29 July 2026. The first day is physical and the remaining sessions are virtual.
      Join our WhatsApp channel for updates.
    `);

    expect(cleaned).not.toMatch(
      /Advertisement|Apply now|https?:\/\/|WhatsApp/i,
    );
    expect(cleaned).toContain("27 to 29 July 2026");
    expect(cleaned).toContain("\n\n");
  });

  it("cleans and deduplicates structured lists for display", () => {
    expect(
      cleanOpportunityListForDisplay([
        "• Own or manage a small business.",
        "Own or manage a small business.",
        "Click here to apply",
        "Application deadline: 20 July 2026",
      ]),
    ).toEqual([
      "Own or manage a small business.",
      "Application deadline: 20 July 2026",
    ]);
  });

  it("previews cleaned copy rather than advert text", () => {
    const preview = previewText(
      "Advertisement\nApply now\nThis programme helps founders strengthen operations, profitability and business networks through practical training.",
      80,
    );

    expect(preview).not.toMatch(/Advertisement|Apply now/i);
    expect(preview).toMatch(/^This programme helps founders/);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("detects when About copy should use progressive disclosure", () => {
    expect(needsProgressiveDisclosure("A short description.")).toBe(false);
    expect(
      needsProgressiveDisclosure(
        "A useful paragraph.\n\nSecond useful paragraph.\n\nThird useful paragraph.",
      ),
    ).toBe(true);
    expect(needsProgressiveDisclosure("Detailed copy ".repeat(50))).toBe(true);
  });

  it("hides a summary that repeats the description", () => {
    const description =
      "The programme supports founders with practical business training and expert guidance. Participants also build useful peer networks.";

    expect(shouldShowOpportunitySummary(description, description)).toBe(false);
    expect(
      shouldShowOpportunitySummary(
        "The programme supports founders with practical business training and expert guidance.",
        description,
      ),
    ).toBe(false);
  });

  it("keeps a concise summary when it adds distinct decision context", () => {
    expect(
      shouldShowOpportunitySummary(
        "A three-day hybrid programme for registered and unregistered SME owners.",
        "Participants receive practical training on profitability, operations and business networks from experienced facilitators.",
      ),
    ).toBe(true);
  });
});
