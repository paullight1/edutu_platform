import { CrescivaEngineController } from "./cresciva-engine.controller";

describe("CrescivaEngineController", () => {
  const scraper = {
    getEngineStatus: jest.fn().mockResolvedValue({ success: true }),
    getScopedJobs: jest.fn().mockResolvedValue([]),
    getScopedJobOpportunities: jest.fn().mockResolvedValue([]),
    getScopedOpportunities: jest.fn().mockResolvedValue([]),
    startScraperRun: jest.fn().mockReturnValue({ started: true }),
  };
  const sources = { getSources: jest.fn().mockResolvedValue([]) };
  const controller = new CrescivaEngineController(
    scraper as never,
    sources as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("returns only grant-scoped run history to Cresciva", async () => {
    await controller.runs("25");
    expect(scraper.getScopedJobs).toHaveBeenCalledWith(25, "grants");
  });

  it("returns only grant-tagged opportunities to Cresciva", async () => {
    await controller.runOpportunities("run-123");
    expect(scraper.getScopedJobOpportunities).toHaveBeenCalledWith(
      "run-123",
      "grants",
    );
  });

  it("returns the grant-tagged Edutu feed to Cresciva", async () => {
    await controller.opportunities("50");
    expect(scraper.getScopedOpportunities).toHaveBeenCalledWith("grants", 50);
  });

  it("forces every Cresciva run into grant-only mode", () => {
    controller.start({ allSources: true, maxPages: 2, incremental: true });
    expect(scraper.startScraperRun).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityScope: "grants" }),
    );
  });
});
