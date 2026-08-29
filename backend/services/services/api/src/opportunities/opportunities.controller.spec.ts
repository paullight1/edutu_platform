import { OpportunitiesController } from "./opportunities.controller";

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
    const controller = new OpportunitiesController(
      service as any,
      {} as any,
      {} as any,
    );

    const result = await controller.findAll(response as any, 20, 0);

    expect(service.findAll).toHaveBeenCalledWith(20, 0, "active", undefined);
    expect(result).toEqual([expect.objectContaining({ id: approved.id })]);
  });

  it("delegates the admin quality scorecard to the opportunities service", async () => {
    const quality = { total: 10, active: 8, active_missing_deadline: 2 };
    const service = {
      getQualityScorecard: jest.fn().mockResolvedValue(quality),
    };
    const controller = new OpportunitiesController(
      service as any,
      {} as any,
      {} as any,
    );

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
    const controller = new OpportunitiesController(
      service as any,
      {} as any,
      {} as any,
    );

    await expect(controller.adminBulkEnhance({ ids })).resolves.toEqual({
      success: true,
      ...outcome,
    });
    expect(service.enhanceOpportunities).toHaveBeenCalledWith(ids);
  });
});
