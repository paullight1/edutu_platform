import { describe, expect, it, jest } from "@jest/globals";
import { OpportunityImageGenerationService } from "./opportunity-image-generation.service";

describe("OpportunityImageGenerationService", () => {
  it("saves a details-based flyer as the opportunity image", async () => {
    const opportunity = {
      id: "opp-1",
      title: "ECOWAS Young Professional Programme",
      image_url: "https://source.example/person.jpg",
      metadata: { source_image_url: "https://source.example/person.jpg" },
    };
    const flyer = {
      url: "https://storage.example/opportunity-share-cards/opp-1.png",
      path: "active/opp-1.png",
      format: "png" as const,
      generatedAt: "2026-10-08T00:00:00.000Z",
      fingerprint: "f00ba4",
      expiresAt: null,
    };
    const opportunitiesService = {
      findOneForAdmin: jest.fn().mockResolvedValue(opportunity),
      updateGeneratedImage: jest.fn().mockResolvedValue({
        ...opportunity,
        image_url: flyer.url,
      }),
    };
    const shareCardService = {
      ensureShareCardForOpportunity: jest.fn().mockResolvedValue(flyer),
    };
    const service = new OpportunityImageGenerationService(
      opportunitiesService as any,
      shareCardService as any,
    );

    const result = await service.generateForOpportunity("opp-1");

    expect(shareCardService.ensureShareCardForOpportunity).toHaveBeenCalledWith(
      opportunity,
      { force: true },
    );
    expect(opportunitiesService.updateGeneratedImage).toHaveBeenCalledWith(
      "opp-1",
      flyer.url,
      expect.objectContaining({
        path: flyer.path,
        provider: "edutu-flyer-renderer",
        format: "png",
        source_image_url: "https://source.example/person.jpg",
      }),
    );
    expect(result).toMatchObject({ success: true, imageUrl: flyer.url, flyer });
  });

  it("does not fall back to a source photo when flyer rendering fails", async () => {
    const opportunitiesService = {
      findOneForAdmin: jest.fn().mockResolvedValue({ id: "opp-1" }),
      updateGeneratedImage: jest.fn(),
    };
    const shareCardService = {
      ensureShareCardForOpportunity: jest.fn().mockResolvedValue(null),
    };
    const service = new OpportunityImageGenerationService(
      opportunitiesService as any,
      shareCardService as any,
    );

    await expect(service.generateForOpportunity("opp-1")).rejects.toThrow(
      "Could not generate the opportunity flyer",
    );
    expect(opportunitiesService.updateGeneratedImage).not.toHaveBeenCalled();
  });
});
