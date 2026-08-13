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
});
