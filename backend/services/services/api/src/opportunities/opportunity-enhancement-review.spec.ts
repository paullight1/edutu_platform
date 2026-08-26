import {
  buildOpportunityEnhancementReview,
  buildSelectedEnhancementUpdate,
  signOpportunityEnhancementPreview,
  verifyOpportunityEnhancementPreviewToken,
  type OpportunityEnhancementPreview,
} from "./opportunity-enhancement-review";

const CREATED_AT = "2026-08-26T04:30:00.000Z";
const EXPIRES_AT = "2026-08-26T04:50:00.000Z";
const BASE_UPDATED_AT = "2026-08-26T04:00:00.000Z";

function buildReview(
  overrides: Partial<Parameters<typeof buildOpportunityEnhancementReview>[0]> = {},
): OpportunityEnhancementPreview {
  return buildOpportunityEnhancementReview({
    opportunityId: "opportunity-1",
    baseUpdatedAt: BASE_UPDATED_AT,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    sourceBacked: true,
    before: {
      summary: "A short existing summary.",
      description: "An existing description with limited information.",
      organization: "Local Buka",
      location: "Lagos, Nigeria",
      deadline: null,
      applicationUrl: "https://localbuka.example/apply",
      sourceUrl: "https://localbuka.example/internship",
      fundingType: null,
      targetRegion: "Nigeria",
      eligibilityCriteria: null,
      eligibility: { countries: ["Nigeria"] },
      requirements: [],
      benefits: [],
      applicationProcess: [],
      skills: [],
      tags: ["internship"],
    },
    proposed: {
      summary:
        "Local Buka offers an internship for early-career candidates interested in food technology and operations.",
      description:
        "Local Buka is building technology for food discovery and delivery.\n\nInterns will support practical projects while learning from the operations team.",
      organization: "Local Buka",
      location: "Lagos, Nigeria",
      deadline: "2026-10-31",
      applicationUrl: "https://localbuka.example/apply",
      sourceUrl: "https://localbuka.example/internship",
      fundingType: "Paid internship",
      targetRegion: "Nigeria",
      eligibilityCriteria: "Open to students and recent graduates in Nigeria.",
      eligibility: { countries: ["Nigeria"] },
      requirements: ["Applicants must be students or recent graduates."],
      benefits: ["Practical experience with a growing food-technology team."],
      applicationProcess: ["Complete the official online application form."],
      skills: ["Operations", "Research"],
      tags: ["internship", "food technology"],
    },
    beforeQuality: {
      score: 32,
      missingFields: ["requirements", "benefits", "deadline"],
    },
    afterQuality: { score: 88, missingFields: [] },
    diagnostics: {
      aiAttempted: true,
      aiFallback: false,
      aiError: null,
      sourceUrl: "https://localbuka.example/internship",
      sourceDomain: "localbuka.example",
      sourceTextLength: 2400,
    },
    ...overrides,
  });
}

describe("opportunity enhancement review", () => {
  it("marks changed editorial copy as editable and selected by default", () => {
    const review = buildReview();

    const summary = review.fields.find((field) => field.name === "summary");
    const description = review.fields.find(
      (field) => field.name === "description",
    );

    expect(summary).toMatchObject({
      status: "editorial",
      selectable: true,
      selectedByDefault: true,
      editable: true,
    });
    expect(description).toMatchObject({
      status: "editorial",
      selectable: true,
      selectedByDefault: true,
      editable: true,
    });
  });

  it("allows a changed hard fact only when the proposal is source-backed", () => {
    const review = buildReview();
    const deadline = review.fields.find((field) => field.name === "deadline");

    expect(deadline).toMatchObject({
      status: "source_backed",
      selectable: true,
      selectedByDefault: true,
      editable: false,
      before: null,
      after: "2026-10-31",
    });
  });

  it("blocks a newly proposed hard fact when no useful source text supports it", () => {
    const review = buildReview({ sourceBacked: false });
    const deadline = review.fields.find((field) => field.name === "deadline");
    const funding = review.fields.find(
      (field) => field.name === "fundingType",
    );

    expect(deadline).toMatchObject({
      status: "unsupported",
      selectable: false,
      selectedByDefault: false,
      editable: false,
    });
    expect(funding).toMatchObject({
      status: "unsupported",
      selectable: false,
      selectedByDefault: false,
    });
  });

  it("distinguishes retained hard facts, unresolved fields and unchanged copy", () => {
    const review = buildReview({
      proposed: {
        summary: "A short existing summary.",
        description: "An existing description with limited information.",
        organization: "Local Buka",
        location: "Lagos, Nigeria",
        deadline: null,
        applicationUrl: "https://localbuka.example/apply",
        sourceUrl: "https://localbuka.example/internship",
        fundingType: null,
        targetRegion: "Nigeria",
        eligibilityCriteria: null,
        eligibility: { countries: ["Nigeria"] },
        requirements: [],
        benefits: [],
        applicationProcess: [],
        skills: [],
        tags: ["internship"],
      },
    });

    expect(
      review.fields.find((field) => field.name === "summary"),
    ).toMatchObject({ status: "unchanged", selectable: false });
    expect(
      review.fields.find((field) => field.name === "organization"),
    ).toMatchObject({ status: "existing_verified", selectable: false });
    expect(
      review.fields.find((field) => field.name === "fundingType"),
    ).toMatchObject({ status: "unresolved", selectable: false });
  });

  it("builds the default selection from changed selectable fields only", () => {
    const review = buildReview({ sourceBacked: false });

    expect(review.defaultSelectedFields).toContain("summary");
    expect(review.defaultSelectedFields).toContain("description");
    expect(review.defaultSelectedFields).not.toContain("deadline");
    expect(review.defaultSelectedFields).not.toContain("fundingType");
  });
});

describe("opportunity enhancement review tokens", () => {
  const secret = "a-test-only-opportunity-review-secret";

  it("round-trips an unmodified signed preview", () => {
    const review = buildReview();
    const token = signOpportunityEnhancementPreview(review, secret);

    const decoded = verifyOpportunityEnhancementPreviewToken(token, secret, {
      now: new Date("2026-08-26T04:40:00.000Z"),
    });

    expect(decoded).toEqual(review);
  });

  it("rejects a token whose payload was changed after signing", () => {
    const token = signOpportunityEnhancementPreview(buildReview(), secret);
    const [payload, signature] = token.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${
      payload.endsWith("A") ? "B" : "A"
    }`;

    expect(() =>
      verifyOpportunityEnhancementPreviewToken(
        `${tamperedPayload}.${signature}`,
        secret,
        { now: new Date("2026-08-26T04:40:00.000Z") },
      ),
    ).toThrow(/invalid|signature|token/i);
  });

  it("rejects expired previews", () => {
    const token = signOpportunityEnhancementPreview(buildReview(), secret);

    expect(() =>
      verifyOpportunityEnhancementPreviewToken(token, secret, {
        now: new Date("2026-08-26T05:00:00.000Z"),
      }),
    ).toThrow(/expired/i);
  });

  it("fails closed when no signing secret is configured", () => {
    expect(() =>
      signOpportunityEnhancementPreview(buildReview(), ""),
    ).toThrow(/secret/i);
    expect(() =>
      verifyOpportunityEnhancementPreviewToken("payload.signature", ""),
    ).toThrow(/secret/i);
  });
});

describe("selected opportunity enhancement updates", () => {
  it("returns only selected proposal fields", () => {
    const review = buildReview();

    expect(
      buildSelectedEnhancementUpdate(review, {
        selectedFields: ["summary", "benefits"],
      }),
    ).toEqual({
      summary: review.proposed.summary,
      benefits: review.proposed.benefits,
    });
  });

  it("accepts administrator edits only for editorial and structured-list fields", () => {
    const review = buildReview();

    expect(
      buildSelectedEnhancementUpdate(review, {
        selectedFields: ["summary", "requirements"],
        edits: {
          summary: "Administrator-approved summary.",
          requirements: ["A corrected source-backed requirement."],
        },
      }),
    ).toEqual({
      summary: "Administrator-approved summary.",
      requirements: ["A corrected source-backed requirement."],
    });

    expect(() =>
      buildSelectedEnhancementUpdate(review, {
        selectedFields: ["deadline"],
        edits: { deadline: "2027-01-01" },
      }),
    ).toThrow(/deadline|editable/i);
  });

  it("rejects an attempt to apply a disabled field", () => {
    const review = buildReview({ sourceBacked: false });

    expect(() =>
      buildSelectedEnhancementUpdate(review, {
        selectedFields: ["deadline"],
      }),
    ).toThrow(/deadline|selectable|unsupported/i);
  });
});
