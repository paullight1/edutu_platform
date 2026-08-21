import { ScraperController } from "./scraper.controller";

describe("ScraperController source control plane", () => {
  it("routes source CRUD through the dedicated source admin service", async () => {
    const scraperService = {
      getSources: jest.fn(),
      addSource: jest.fn(),
      updateSource: jest.fn(),
      deleteSource: jest.fn(),
    };
    const sourceAdmin = {
      getSources: jest.fn().mockResolvedValue([{ id: 7, name: "DAAD" }]),
      addSource: jest.fn().mockResolvedValue({ success: true, data: { id: 7 } }),
      updateSource: jest.fn().mockResolvedValue({ success: true }),
      deleteSource: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new ScraperController(
      scraperService as any,
      sourceAdmin as any,
    );

    await expect(controller.getSources()).resolves.toEqual([
      { id: 7, name: "DAAD" },
    ]);

    const createInput = {
      name: "DAAD",
      url: "https://www.daad.de/",
      priority: 1,
      enabled: true,
      config: { item_selector: "article" },
    };
    await controller.addSource(createInput);
    expect(sourceAdmin.addSource).toHaveBeenCalledWith(createInput);

    const patch = {
      priority: 2,
      category: "scholarship",
      config: { next_page_selector: "a.next" },
    };
    await controller.updateSource("7", patch);
    expect(sourceAdmin.updateSource).toHaveBeenCalledWith(7, patch);

    await controller.deleteSource("7");
    expect(sourceAdmin.deleteSource).toHaveBeenCalledWith(7);

    expect(scraperService.getSources).not.toHaveBeenCalled();
    expect(scraperService.addSource).not.toHaveBeenCalled();
    expect(scraperService.updateSource).not.toHaveBeenCalled();
    expect(scraperService.deleteSource).not.toHaveBeenCalled();
  });
});
