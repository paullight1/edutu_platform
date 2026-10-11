import { StreamableFile } from "@nestjs/common";
import { OpportunitiesController } from "./opportunities.controller";

function createController(
  opportunitiesService: Record<string, unknown>,
  sourceImageService: Record<string, unknown> = {},
) {
  return new OpportunitiesController(
    opportunitiesService as any,
    {} as any,
    {} as any,
    {} as any,
    sourceImageService as any,
  );
}

describe("OpportunitiesController learner publication surface", () => {
  it("requests active opportunities for the learner feed", async () => {
    const approved = {
      id: "approved-opp-1",
      title: "Approved community scholarship",
      status: "active",
    };
    const service = {
      findAll: jest.fn().mockResolvedValue([approved]),
    };
    const response = { setHeader: jest.fn() };
    const controller = createController(service);

    const result = await controller.findAll(response as any, 20, 0);

    expect(service.findAll).toHaveBeenCalledWith(20, 0, "active", undefined);
    expect(result).toEqual([expect.objectContaining({ id: approved.id })]);
  });

  it("delegates the admin quality scorecard to the opportunities service", async () => {
    const quality = { total: 10, active: 8, active_missing_deadline: 2 };
    const service = {
      getQualityScorecard: jest.fn().mockResolvedValue(quality),
    };
    const controller = createController(service);

    await expect(controller.getQualityScorecard()).resolves.toEqual(quality);
    expect(service.getQualityScorecard).toHaveBeenCalledTimes(1);
  });

  it("delegates one bounded bulk AI-complete request to the opportunities service", async () => {
    const ids = [
      "1827885d-2d96-469e-b7f4-c580dd537334",
      "0f4309b5-d5f2-4e1e-a732-4932730dc4b3",
    ];
    const outcome = { processed: 2, enhanced: 1, failed: 1 };
    const service = {
      enhanceOpportunities: jest.fn().mockResolvedValue(outcome),
    };
    const controller = createController(service);

    await expect(controller.adminBulkEnhance({ ids })).resolves.toEqual({
      success: true,
      ...outcome,
    });
    expect(service.enhanceOpportunities).toHaveBeenCalledWith(ids);
  });
});

describe("admin bulk action contracts", () => {
  const ids = ["1827885d-2d96-469e-b7f4-c580dd537334"];
  it.each(["active", "rejected"])(
    "updates only selected IDs to %s",
    async (status) => {
      const service = {
        bulkUpdateStatus: jest.fn().mockResolvedValue({ updated: 1 }),
      };
      const controller = createController(service);
      await expect(
        controller.adminBulkStatus({ ids, status } as any),
      ).resolves.toEqual({ updated: 1 });
      expect(service.bulkUpdateStatus).toHaveBeenCalledWith(ids, status);
    },
  );
  it("normalizes the selected category", async () => {
    const service = {
      bulkUpdateCategory: jest.fn().mockResolvedValue({ updated: 1 }),
    };
    const controller = createController(service);
    await controller.adminBulkCategory({ ids, category: "Internships" } as any);
    expect(service.bulkUpdateCategory).toHaveBeenCalledWith(ids, "internships");
  });
  it("rejects unknown categories before writing", () => {
    const service = { bulkUpdateCategory: jest.fn() };
    const controller = createController(service);
    expect(() =>
      controller.adminBulkCategory({ ids, category: "invalid" } as any),
    ).toThrow();
    expect(service.bulkUpdateCategory).not.toHaveBeenCalled();
  });
  it("deletes only selected IDs and returns the actual deleted count", async () => {
    const service = { bulkRemove: jest.fn().mockResolvedValue({ deleted: 0 }) };
    const controller = createController(service);
    await expect(controller.adminBulkDelete({ ids })).resolves.toEqual({
      deleted: 0,
    });
    expect(service.bulkRemove).toHaveBeenCalledWith(ids);
  });
});

describe("admin original source image", () => {
  it("streams the original image with private caching and content sniffing disabled", async () => {
    const image = {
      buffer: Buffer.from("image-data"),
      contentType: "image/jpeg",
    };
    const sourceImageService = {
      getForOpportunity: jest.fn().mockResolvedValue(image),
    };
    const response = { setHeader: jest.fn() };
    const controller = createController({}, sourceImageService);

    const result = await controller.getAdminSourceImage(
      "opportunity-1",
      response as any,
    );

    expect(sourceImageService.getForOpportunity).toHaveBeenCalledWith(
      "opportunity-1",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "image/jpeg",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, max-age=300",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Content-Type-Options",
      "nosniff",
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it("returns not found when no original source image exists", async () => {
    const controller = createController(
      {},
      {
        getForOpportunity: jest.fn().mockResolvedValue(null),
      },
    );

    await expect(
      controller.getAdminSourceImage("opportunity-1", {
        setHeader: jest.fn(),
      } as any),
    ).rejects.toThrow("Original image not found.");
  });
});
