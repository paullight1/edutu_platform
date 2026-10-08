import { describe, expect, it, jest } from "@jest/globals";
import { OpportunityImageGenerationService } from "./opportunity-image-generation.service";

describe("OpportunityImageGenerationService", () => {
  it("composes opportunity-specific AI artwork into a flyer", async () => {
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
    const aiService = {
      generateImage: jest.fn().mockResolvedValue({
        data: Buffer.from("ai-artwork"),
        mimeType: "image/png",
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
      }),
    };
    const service = new OpportunityImageGenerationService(
      aiService as any,
      opportunitiesService as any,
      shareCardService as any,
    );

    const result = await service.generateForOpportunity("opp-1");

    expect(shareCardService.ensureShareCardForOpportunity).toHaveBeenCalledWith(
      opportunity,
      {
        force: true,
        artwork: { data: Buffer.from("ai-artwork"), mimeType: "image/png" },
      },
    );
    const prompt = aiService.generateImage.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("ECOWAS Young Professional Programme");
    expect(prompt).toContain("Do not depict people, portraits");
    expect(opportunitiesService.updateGeneratedImage).toHaveBeenCalledWith(
      "opp-1",
      flyer.url,
      expect.objectContaining({
        path: flyer.path,
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
        composition: "ai-artwork-with-verified-opportunity-details",
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
    const aiService = {
      generateImage: jest.fn().mockResolvedValue({
        data: Buffer.from("ai-artwork"),
        mimeType: "image/png",
        provider: "openai",
        model: "gpt-image-2.5-sunburst",
      }),
    };
    const service = new OpportunityImageGenerationService(
      aiService as any,
      opportunitiesService as any,
      shareCardService as any,
    );

    await expect(service.generateForOpportunity("opp-1")).rejects.toThrow(
      "the opportunity flyer could not be saved",
    );
    expect(opportunitiesService.updateGeneratedImage).not.toHaveBeenCalled();
  });

  it("does not create a static flyer if AI artwork generation fails", async () => {
    const opportunitiesService = {
      findOneForAdmin: jest.fn().mockResolvedValue({ id: "opp-1" }),
      updateGeneratedImage: jest.fn(),
    };
    const shareCardService = {
      ensureShareCardForOpportunity: jest.fn(),
    };
    const aiService = {
      generateImage: jest.fn().mockRejectedValue(new Error("provider offline")),
    };
    const service = new OpportunityImageGenerationService(
      aiService as any,
      opportunitiesService as any,
      shareCardService as any,
    );

    await expect(service.generateForOpportunity("opp-1")).rejects.toThrow(
      "AI flyer artwork could not be generated",
    );
    expect(
      shareCardService.ensureShareCardForOpportunity,
    ).not.toHaveBeenCalled();
    expect(opportunitiesService.updateGeneratedImage).not.toHaveBeenCalled();
  });
});
