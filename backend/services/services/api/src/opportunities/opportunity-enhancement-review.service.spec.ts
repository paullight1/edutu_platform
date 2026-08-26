import { ConflictException, NotFoundException } from "@nestjs/common";
import { OpportunityEnhancementReviewService } from "./opportunity-enhancement-review.service";

const REVIEW_SECRET = "test-only-opportunity-review-secret";
const NOW = new Date("2026-08-26T05:00:00.000Z");

function originalOpportunity() {
  return {
    id: "opportunity-1",
    title: "Local Buka Internship Opportunities 2026",
    summary: "Local Buka Internship Opportunities 2026.",
    description:
      "Local Buka is transforming food discovery in Africa and the world by connecting users to food businesses.",
    organization: "Local Buka",
    category: "Internships",
    location: "Lagos, Nigeria",
    close_date: null,
    application_url: "https://localbuka.example/apply",
    source_url: "https://localbuka.example/internship",
    funding_type: null,
    target_region: "Nigeria",
    eligibility: { countries: ["Nigeria"] },
    skills: [],
    tags: ["internship"],
    updated_at: "2026-08-26T04:30:00.000Z",
    metadata: {
      existing_key: "preserve-me",
      application_fee: { is_free: true, amount: null, currency: null },
      benefits: ["Existing verified benefit"],
      requirements: [],
      application_process: [],
    },
  };
}

function enhancedOpportunity() {
  return {
    ...originalOpportunity(),
    summary:
      "Local Buka offers a practical internship for students and recent graduates interested in food technology, research and operations.",
    description:
      "Local Buka is building technology that helps people discover food businesses across Africa.\n\nInterns will contribute to practical research and operations projects while learning from an early-stage technology team. Applications are open to students and recent graduates in Nigeria.",
    deadline: "2026-10-31",
    close_date: "2026-10-31",
    funding_type: "Paid internship",
    eligibility_criteria: "Open to students and recent graduates in Nigeria.",
    requirements: ["Applicants must be students or recent graduates."],
    benefits: [
      "Practical experience with a growing food-technology team.",
      "Mentorship from the operations team.",
    ],
    application_process: ["Complete the official online application form."],
    skills: ["Operations", "Research"],
    tags: ["internship", "food technology"],
    metadata: {
      ...originalOpportunity().metadata,
      requirements: ["Applicants must be students or recent graduates."],
      benefits: [
        "Practical experience with a growing food-technology team.",
        "Mentorship from the operations team.",
      ],
      application_process: ["Complete the official online application form."],
      extraction_quality_score: 88,
      extraction_missing_fields: [],
    },
  };
}

describe("OpportunityEnhancementReviewService", () => {
  const previousSecret = process.env.OPPORTUNITY_REVIEW_SECRET;

  let opportunitiesService: {
    findOne: jest.Mock;
    invalidateCatalogCache: jest.Mock;
  };
  let scraperService: { enhancePreviewOpportunity: jest.Mock };
  let evidenceService: { inspect: jest.Mock };
  let repository: { apply: jest.Mock };
  let embeddingService: { embedOpportunity: jest.Mock };
  let shareCardService: { ensureShareCardForOpportunity: jest.Mock };
  let service: OpportunityEnhancementReviewService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    process.env.OPPORTUNITY_REVIEW_SECRET = REVIEW_SECRET;

    opportunitiesService = {
      findOne: jest.fn(),
      invalidateCatalogCache: jest.fn().mockResolvedValue(undefined),
    };
    scraperService = {
      enhancePreviewOpportunity: jest.fn(),
    };
    evidenceService = {
      inspect: jest.fn(),
    };
    repository = {
      apply: jest.fn(),
    };
    embeddingService = {
      embedOpportunity: jest.fn(),
    };
    shareCardService = {
      ensureShareCardForOpportunity: jest.fn().mockResolvedValue(undefined),
    };

    service = new OpportunityEnhancementReviewService(
      opportunitiesService as never,
      scraperService as never,
      evidenceService as never,
      repository as never,
      embeddingService as never,
      shareCardService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previousSecret === undefined) {
      delete process.env.OPPORTUNITY_REVIEW_SECRET;
    } else {
      process.env.OPPORTUNITY_REVIEW_SECRET = previousSecret;
    }
    jest.restoreAllMocks();
  });

  it("creates a signed before-and-after preview without persisting anything", async () => {
    const original = originalOpportunity();
    opportunitiesService.findOne.mockResolvedValue(original);
    evidenceService.inspect.mockResolvedValue({
      sourceBacked: true,
      sourceUrl: original.source_url,
      sourceDomain: "localbuka.example",
      sourceTextLength: 2300,
      error: null,
    });
    scraperService.enhancePreviewOpportunity.mockResolvedValue({
      success: true,
      opportunity: enhancedOpportunity(),
      completeness: {
        score: 88,
        missingFields: [],
      },
    });

    const result = await service.createPreview(original.id);

    expect(result.success).toBe(true);
    expect(result.previewToken).toEqual(expect.any(String));
    expect(result.preview.opportunityId).toBe(original.id);
    expect(result.preview.beforeQuality.score).toBeLessThan(
      result.preview.afterQuality.score,
    );
    expect(
      result.preview.fields.find((field) => field.name === "deadline"),
    ).toMatchObject({ status: "source_backed", selectable: true });
    expect(result.preview.diagnostics).toMatchObject({
      aiAttempted: true,
      aiFallback: false,
      sourceBacked: true,
      sourceDomain: "localbuka.example",
      sourceTextLength: 2300,
    });
    expect(repository.apply).not.toHaveBeenCalled();
    expect(opportunitiesService.invalidateCatalogCache).not.toHaveBeenCalled();
    expect(embeddingService.embedOpportunity).not.toHaveBeenCalled();
    expect(
      shareCardService.ensureShareCardForOpportunity,
    ).not.toHaveBeenCalled();
  });

  it("shows unsupported proposed facts honestly when no useful source was found", async () => {
    const original = originalOpportunity();
    opportunitiesService.findOne.mockResolvedValue(original);
    evidenceService.inspect.mockResolvedValue({
      sourceBacked: false,
      sourceUrl: original.source_url,
      sourceDomain: "localbuka.example",
      sourceTextLength: 90,
      error: "Source page did not contain enough useful text.",
    });
    scraperService.enhancePreviewOpportunity.mockResolvedValue({
      success: true,
      opportunity: enhancedOpportunity(),
      completeness: { score: 88, missingFields: [] },
    });

    const result = await service.createPreview(original.id);

    expect(
      result.preview.fields.find((field) => field.name === "deadline"),
    ).toMatchObject({ status: "unsupported", selectable: false });
    expect(
      result.preview.fields.find((field) => field.name === "requirements"),
    ).toMatchObject({ status: "unsupported", selectable: false });
    expect(result.preview.diagnostics).toMatchObject({
      aiFallback: true,
      sourceBacked: false,
      evidenceError: "Source page did not contain enough useful text.",
    });
  });

  it("throws when the opportunity does not exist", async () => {
    opportunitiesService.findOne.mockResolvedValue(null);

    await expect(service.createPreview("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(scraperService.enhancePreviewOpportunity).not.toHaveBeenCalled();
  });

  it("applies only selected fields, deep-merges metadata and refreshes derived assets", async () => {
    const original = originalOpportunity();
    const enhanced = enhancedOpportunity();
    const updated = {
      ...original,
      summary: "Administrator-approved summary.",
      metadata: {
        ...original.metadata,
        requirements: ["Corrected source-backed requirement."],
      },
      updated_at: "2026-08-26T05:01:00.000Z",
    };

    opportunitiesService.findOne
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);
    evidenceService.inspect.mockResolvedValue({
      sourceBacked: true,
      sourceUrl: original.source_url,
      sourceDomain: "localbuka.example",
      sourceTextLength: 2300,
      error: null,
    });
    scraperService.enhancePreviewOpportunity.mockResolvedValue({
      success: true,
      opportunity: enhanced,
      completeness: { score: 88, missingFields: [] },
    });
    repository.apply.mockResolvedValue(true);

    const preview = await service.createPreview(original.id);
    const result = await service.applyPreview(original.id, {
      previewToken: preview.previewToken,
      selectedFields: ["summary", "requirements"],
      edits: {
        summary: "Administrator-approved summary.",
        requirements: ["Corrected source-backed requirement."],
      },
    });

    expect(repository.apply).toHaveBeenCalledWith(
      original.id,
      original.updated_at,
      expect.objectContaining({
        summary: "Administrator-approved summary.",
        metadata: expect.objectContaining({
          existing_key: "preserve-me",
          application_fee: {
            is_free: true,
            amount: null,
            currency: null,
          },
          benefits: ["Existing verified benefit"],
          requirements: ["Corrected source-backed requirement."],
          opportunity_ai_review: expect.objectContaining({
            version: "opportunity-enhancement-review-v1",
            selected_fields: ["summary", "requirements"],
            source_backed: true,
          }),
        }),
      }),
    );
    expect(opportunitiesService.invalidateCatalogCache).toHaveBeenCalledTimes(
      1,
    );
    expect(embeddingService.embedOpportunity).toHaveBeenCalledWith(original.id);
    expect(shareCardService.ensureShareCardForOpportunity).toHaveBeenCalledWith(
      updated,
      { force: true },
    );
    expect(result).toEqual({
      success: true,
      opportunity: updated,
      appliedFields: ["summary", "requirements"],
    });
  });

  it("rejects a stale preview before writing", async () => {
    const original = originalOpportunity();
    const staleCurrent = {
      ...original,
      updated_at: "2026-08-26T04:59:00.000Z",
    };

    opportunitiesService.findOne
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(staleCurrent);
    evidenceService.inspect.mockResolvedValue({
      sourceBacked: true,
      sourceUrl: original.source_url,
      sourceDomain: "localbuka.example",
      sourceTextLength: 2300,
      error: null,
    });
    scraperService.enhancePreviewOpportunity.mockResolvedValue({
      success: true,
      opportunity: enhancedOpportunity(),
      completeness: { score: 88, missingFields: [] },
    });

    const preview = await service.createPreview(original.id);

    await expect(
      service.applyPreview(original.id, {
        previewToken: preview.previewToken,
        selectedFields: ["summary"],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.apply).not.toHaveBeenCalled();
  });

  it("rejects a preview token issued for a different opportunity", async () => {
    const original = originalOpportunity();
    opportunitiesService.findOne.mockResolvedValue(original);
    evidenceService.inspect.mockResolvedValue({
      sourceBacked: true,
      sourceUrl: original.source_url,
      sourceDomain: "localbuka.example",
      sourceTextLength: 2300,
      error: null,
    });
    scraperService.enhancePreviewOpportunity.mockResolvedValue({
      success: true,
      opportunity: enhancedOpportunity(),
      completeness: { score: 88, missingFields: [] },
    });

    const preview = await service.createPreview(original.id);

    await expect(
      service.applyPreview("opportunity-2", {
        previewToken: preview.previewToken,
        selectedFields: ["summary"],
      }),
    ).rejects.toThrow(/different opportunity|opportunity id/i);
    expect(repository.apply).not.toHaveBeenCalled();
  });
});
