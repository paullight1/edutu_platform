import { ScraperService } from "./scraper.service";

it("keeps manual scraper cron disabled in development without an explicit opt-in", async () => {
  const old = { ...process.env };
  process.env.NODE_ENV = "development";
  delete process.env.SCRAPER_SCHEDULER_ENABLED;
  delete process.env.DEV_SCHEDULED_JOBS_ENABLED;
  const service = Object.create(ScraperService.prototype) as ScraperService;
  const reap = jest.fn();
  const initialize = jest.fn();
  Object.assign(service, {
    logger: { log: jest.fn() },
    failOrphanedRuns: reap,
    initializeSchedule: initialize,
  });
  try {
    await service.onModuleInit();
    expect(reap).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  } finally {
    process.env = old;
  }
});

it("does not mutate shared scrape runs when local scheduling is disabled", async () => {
  const old = process.env.SCRAPER_SCHEDULER_ENABLED;
  process.env.SCRAPER_SCHEDULER_ENABLED = "false";
  const service = Object.create(ScraperService.prototype) as ScraperService;
  const reap = jest.fn().mockResolvedValue(undefined);
  Object.assign(service, {
    logger: { log: jest.fn() },
    failOrphanedRuns: reap,
    initializeSchedule: jest.fn().mockResolvedValue(undefined),
  });
  try {
    await service.onModuleInit();
    expect(reap).not.toHaveBeenCalled();
  } finally {
    if (old === undefined) delete process.env.SCRAPER_SCHEDULER_ENABLED;
    else process.env.SCRAPER_SCHEDULER_ENABLED = old;
  }
});
