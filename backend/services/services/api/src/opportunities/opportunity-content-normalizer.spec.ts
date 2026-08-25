import {
  cleanOpportunityList,
  cleanOpportunityNarrative,
  refineOpportunityContent,
} from "./opportunity-content-normalizer";

describe("opportunity content normalizer", () => {
  it("removes adverts, navigation and repeated calls to action while preserving facts", () => {
    const raw = `
      Home | About | Contact | Privacy Policy
      Advertisement
      The Wema SME Business School 6.0 is a three-day programme for entrepreneurs and small business owners.
      It runs from 27 to 29 July 2026, with the first day held physically and the remaining sessions online.
      Apply now
      https://example.org/apply?utm_source=ad
      Share this post
      The programme provides expert-led training in profitability, networking and sustainable growth.
      The programme provides expert-led training in profitability, networking and sustainable growth.
      Join our WhatsApp channel for more opportunities.
    `;

    const cleaned = cleanOpportunityNarrative(raw);

    expect(cleaned).toContain("27 to 29 July 2026");
    expect(cleaned).toContain("expert-led training");
    expect(cleaned).not.toMatch(
      /Advertisement|Privacy Policy|Apply now|https?:\/\/|Share this post|WhatsApp/i,
    );
    expect(cleaned.match(/expert-led training/g)).toHaveLength(1);
    expect(cleaned).toContain("\n\n");
  });

  it("cleans and deduplicates structured lists without removing factual items", () => {
    expect(
      cleanOpportunityList([
        "• Applicants must operate a registered or unregistered SME.",
        "Applicants must operate a registered or unregistered SME.",
        "Click here to apply",
        "Application deadline: 20 July 2026",
        "Subscribe to our newsletter",
      ]),
    ).toEqual([
      "Applicants must operate a registered or unregistered SME.",
      "Application deadline: 20 July 2026",
    ]);
  });

  it("builds a compact summary and quality diagnostics from cleaned content", () => {
    const result = refineOpportunityContent(
      {
        summary: "Apply now! Click here for details.",
        description:
          "The programme helps African founders improve business operations and profitability. Participants attend practical workshops, receive expert guidance, and build useful peer networks. The programme combines an in-person opening session with two virtual learning days. Applications are open to registered and unregistered small businesses.",
        requirements: ["Applicants must own or manage an SME."],
        benefits: [
          "Expert-led business training",
          "Networking with other founders",
        ],
        applicationProcess: ["Complete the official online application form."],
      },
      { sourceBacked: true },
    );

    const words = result.summary.split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(20);
    expect(words.length).toBeLessThanOrEqual(55);
    expect(result.qualityScore).toBeGreaterThanOrEqual(75);
    expect(result.needsReview).toBe(false);
  });

  it("does not accept inferred structured facts when enrichment was not source-backed", () => {
    const result = refineOpportunityContent(
      {
        description: "A leadership programme for early-career professionals.",
        requirements: ["Applicants must hold a first-class degree."],
        benefits: ["Fully funded international travel."],
        applicationProcess: ["Upload a passport and recommendation letters."],
      },
      { sourceBacked: false, allowUnverifiedLists: false },
    );

    expect(result.requirements).toEqual([]);
    expect(result.benefits).toEqual([]);
    expect(result.applicationProcess).toEqual([]);
    expect(result.needsReview).toBe(true);
  });
});
