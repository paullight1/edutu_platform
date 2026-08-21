import { installScraperRuntimePolicy } from "./scraper-runtime-policy";

describe("installScraperRuntimePolicy", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEngineMode = process.env.ENGINE_MODE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalEngineMode === undefined) delete process.env.ENGINE_MODE;
    else process.env.ENGINE_MODE = originalEngineMode;
  });

  it("fails explicitly when production storage is not configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENGINE_MODE;
    const originalRun = jest.fn().mockResolvedValue({
      success: true,
      sources: ["Mock Source"],
    });
    const service = { supabase: null, runScraper: originalRun } as any;

    const restore = installScraperRuntimePolicy(service);
    await expect(
      service.runScraper({ allSources: true, runType: "manual" }),
    ).resolves.toEqual({
      success: false,
      error: "Scraper is not configured",
    });
    expect(originalRun).not.toHaveBeenCalled();
    restore();
  });

  it("preserves explicit test/development mock behavior", async () => {
    process.env.NODE_ENV = "test";
    const originalResult = { success: true, sources: ["Mock Source"] };
    const originalRun = jest.fn().mockResolvedValue(originalResult);
    const service = { supabase: null, runScraper: originalRun } as any;

    const restore = installScraperRuntimePolicy(service);
    await expect(service.runScraper({ allSources: true })).resolves.toEqual(
      originalResult,
    );
    expect(originalRun).toHaveBeenCalledTimes(1);
    restore();
  });

  it("does not alter configured production scraper runs", async () => {
    process.env.NODE_ENV = "production";
    const originalResult = { success: true, totalResults: 12 };
    const originalRun = jest.fn().mockResolvedValue(originalResult);
    const service = { supabase: {}, runScraper: originalRun } as any;

    const restore = installScraperRuntimePolicy(service);
    await expect(service.runScraper({ allSources: true })).resolves.toEqual(
      originalResult,
    );
    expect(originalRun).toHaveBeenCalledTimes(1);
    restore();
  });
});
