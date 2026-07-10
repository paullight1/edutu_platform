import { Test, TestingModule } from "@nestjs/testing";
import { ScraperService } from "./scraper.service";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "../opportunities/opportunity-share-card.service";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { RobotsChecker } from "./robots-checker";
import { OpportunityDedupService } from "./opportunity-dedup.service";

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.mock("../db", () => ({
  pool: { connect: (...args: unknown[]) => mockConnect(...args) },
  db: {},
}));

describe("ScraperService advisory lock (withScrapeLock)", () => {
  let service: ScraperService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: SchedulerRegistry, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: OpportunityShareCardService, useValue: {} },
        { provide: ScraperAlertsService, useValue: {} },
        { provide: RobotsChecker, useValue: {} },
        { provide: OpportunityDedupService, useValue: {} },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
  });

  it("runs the work and releases the lock when acquired", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] }) // pg_try_advisory_lock
      .mockResolvedValueOnce({}); // pg_advisory_unlock

    const work = jest.fn().mockResolvedValue("done");
    const result = await (service as any).withScrapeLock(work);

    expect(result).toEqual({ acquired: true, result: "done" });
    expect(work).toHaveBeenCalledTimes(1);
    // lock + unlock issued, and the connection returned to the pool.
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toMatch(/pg_advisory_unlock/);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("does NOT run the work when the lock is already held", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ locked: false }] });

    const work = jest.fn().mockResolvedValue("should-not-run");
    const result = await (service as any).withScrapeLock(work);

    expect(result).toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled();
    // No unlock is attempted (we never acquired it), but the connection is
    // still released back to the pool.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("releases the lock even when the work throws", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({});

    const work = jest.fn().mockRejectedValue(new Error("crawl blew up"));

    await expect((service as any).withScrapeLock(work)).rejects.toThrow(
      "crawl blew up",
    );
    expect(mockQuery.mock.calls[1][0]).toMatch(/pg_advisory_unlock/);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
