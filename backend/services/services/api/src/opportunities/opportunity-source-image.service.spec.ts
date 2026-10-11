import { OpportunitySourceImageService } from "./opportunity-source-image.service";

jest.mock("../scraper/safe-image-fetcher", () => ({
  fetchSafeImage: jest.fn(),
}));

import { fetchSafeImage } from "../scraper/safe-image-fetcher";

describe("OpportunitySourceImageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the original metadata image and returns the bounded safe fetch result", async () => {
    const opportunity = {
      id: "opportunity-1",
      image_url: "https://cdn.edutu.org/opportunity-share-cards/generated.png",
      metadata: { source_image_url: "https://source.example.org/flyer.jpg" },
    };
    const image = {
      buffer: Buffer.from("image-data"),
      contentType: "image/jpeg",
      extension: "jpg",
      sha256: "abc123",
      finalUrl: "https://source.example.org/flyer.jpg",
    };
    const opportunitiesService = {
      findOneForAdmin: jest.fn().mockResolvedValue(opportunity),
    };
    (fetchSafeImage as jest.Mock).mockResolvedValue(image);

    const service = new OpportunitySourceImageService(
      opportunitiesService as any,
    );

    await expect(service.getForOpportunity("opportunity-1")).resolves.toBe(
      image,
    );
    expect(opportunitiesService.findOneForAdmin).toHaveBeenCalledWith(
      "opportunity-1",
    );
    expect(fetchSafeImage).toHaveBeenCalledWith(
      "https://source.example.org/flyer.jpg",
    );
  });

  it("does not fetch an image when the opportunity or original image is missing", async () => {
    const opportunitiesService = {
      findOneForAdmin: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ image_url: null, metadata: {} }),
    };
    const service = new OpportunitySourceImageService(
      opportunitiesService as any,
    );

    await expect(service.getForOpportunity("missing")).resolves.toBeNull();
    await expect(service.getForOpportunity("no-image")).resolves.toBeNull();
    expect(fetchSafeImage).not.toHaveBeenCalled();
  });
});
