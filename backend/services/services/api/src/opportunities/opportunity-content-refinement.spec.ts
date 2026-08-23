import {
  buildOpportunityContentUpdate,
  isSourceBackedOpportunity,
  shouldRefineOpportunity,
} from "./opportunity-content-refinement";

describe("opportunity content refinement", () => {
  it("recognizes both saved-opportunity and batch-enrichment source markers", () => {
    expect(
      isSourceBackedOpportunity({
        metadata: { ai_source_text_used: true },
      }),
    ).toBe(true);
    expect(
      isSourceBackedOpportunity({
        metadata: { ai_enrichment: { source_text_used: true } },
      }),
    ).toBe(true);
  });

  it("preserves existing hard facts while accepting source-backed editorial content", () => {
    const original = {
      id: "opp-1",
      title: "Wema SME Business School 6.0",
      category: "Programs",
      organization: "Wema Bank",
      location: "Nigeria",
      is_remote: false,
      close_date: "2026-07-20",
      application_url: "https://official.example/apply",
      source_url: "https://official.example/programme",
      funding_type: "Free training",
      target_region: "Nigeria",
      eligibility: { countries: ["Nigeria"] },
      status: "active",
      image_url: "https://cdn.example/image.jpg",
      is_featured: true,
      summary: "Old summary",
      description: "Old description.",
      metadata: {
        requirements: ["Own or manage an SME."],
        benefits: ["Business training."],
        application_process: ["Submit the official form."],
      },
    };

    const candidate = {
      ...original,
      close_date: "2027-01-01",
      application_url: "https://wrong.example/apply",
      summary:
        "A practical programme helping Nigerian founders strengthen operations, profitability, financial management and business networks through expert-led sessions designed for owners of registered and unregistered small and medium-sized enterprises.",
      description:
        "Advertisement\nThe programme provides practical business training for Nigerian entrepreneurs. Participants learn how to improve operations and profitability. They also build peer and expert networks that can support sustainable growth. Apply now.",
      metadata: {
        ...original.metadata,
        ai_source_text_used: true,
        requirements: ["Applicants must own or manage an SME."],
        benefits: [
          "Expert-led business training.",
          "Peer networking opportunities.",
        ],
        application_process: ["Complete the official online form."],
      },
    };

    const result = buildOpportunityContentUpdate(original, candidate);

    expect(result.update.deadline).toBe("2026-07-20");
    expect(result.update.applyUrl).toBe("https://official.example/apply");
    expect(result.update.sourceUrl).toBe(
      "https://official.example/programme",
    );
    expect(result.update.fundingType).toBe("Free training");
    expect(result.update.eligibility).toEqual({ countries: ["Nigeria"] });
    expect(result.update.description).not.toMatch(/Advertisement|Apply now/i);
    expect(result.update.requirements).toEqual([
      "Applicants must own or manage an SME.",
    ]);
    expect(result.sourceBacked).toBe(true);
  });

  it("accepts a newly discovered hard fact only when source-backed", () => {
    const original = {
      id: "opp-new-fact",
      title: "Founder Programme",
      description: "A programme for founders.",
      metadata: {},
    };
    const sourceBackedCandidate = {
      ...original,
      close_date: "2026-10-01",
      funding_type: "Fully funded",
      metadata: { ai_source_text_used: true },
    };
    const unverifiedCandidate = {
      ...sourceBackedCandidate,
      metadata: { ai_source_text_used: false },
    };

    expect(
      buildOpportunityContentUpdate(original, sourceBackedCandidate).update
        .deadline,
    ).toBe("2026-10-01");
    expect(
      buildOpportunityContentUpdate(original, sourceBackedCandidate).update
        .fundingType,
    ).toBe("Fully funded");
    expect(
      buildOpportunityContentUpdate(original, unverifiedCandidate).update
        .deadline,
    ).toBeNull();
    expect(
      buildOpportunityContentUpdate(original, unverifiedCandidate).update
        .fundingType,
    ).toBeNull();
  });

  it("clears a newly inferred organization when no source text supported it", () => {
    const original = {
      id: "opp-org",
      title: "Founder Programme",
      description: "A programme for founders.",
      metadata: {},
    };
    const candidate = {
      ...original,
      organization: "Invented Global Foundation",
      metadata: { ai_source_text_used: false },
    };

    expect(
      buildOpportunityContentUpdate(original, candidate).update.organization,
    ).toBeNull();
  });

  it("rejects candidate lists generated without source text", () => {
    const original = {
      id: "opp-2",
      title: "Leadership Programme",
      summary: "",
      description: "A programme for emerging leaders.",
      metadata: {},
    };
    const candidate = {
      ...original,
      description:
        "A programme for emerging leaders. It offers a structured learning experience.",
      metadata: {
        ai_source_text_used: false,
        requirements: ["Applicants must hold a first-class degree."],
        benefits: ["Fully funded international travel."],
        application_process: ["Upload a passport."],
      },
    };

    const result = buildOpportunityContentUpdate(original, candidate);

    expect(result.update.requirements).toEqual([]);
    expect(result.update.benefits).toEqual([]);
    expect(result.update.applicationProcess).toEqual([]);
    expect(result.content.needsReview).toBe(true);
  });

  it("identifies noisy or thin opportunities for backfill", () => {
    expect(
      shouldRefineOpportunity({
        summary: "Apply now",
        description: "Advertisement Click here to apply.",
        metadata: {},
      }),
    ).toBe(true);

    expect(
      shouldRefineOpportunity({
        summary:
          "This practical programme helps business owners improve operations, profitability and long-term growth through structured training, expert guidance and peer learning.",
        description:
          "The programme supports business owners with practical training. Participants learn how to improve operations and profitability. They receive expert guidance and build useful peer networks. The programme is designed to support sustainable growth over time.",
        metadata: {
          requirements: ["Applicants must own or manage a business."],
          benefits: ["Expert-led training."],
          application_process: ["Complete the official form."],
        },
      }),
    ).toBe(false);
  });
});
