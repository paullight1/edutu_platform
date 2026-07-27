import { db } from "../db";
import { CreatorService } from "./creator.service";

jest.mock("../db", () => ({ db: { select: jest.fn() } }));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

const mockedDb = db as unknown as { select: jest.Mock };

describe("CreatorService.getCreatorDashboard", () => {
  let service: CreatorService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new CreatorService({ broadcast: jest.fn() } as any);
  });

  // Each db.select() call returns a chain that resolves on `.execute()`
  // (matching the actual query shape in creator.service.ts, which always
  // terminates its chains with `.execute()`, not a bare thenable).
  const wireSelects = (rows: any[][]) => {
    let call = 0;
    mockedDb.select.mockImplementation(() => {
      const result = rows[call++] ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => Promise.resolve(result),
      };
      return chain;
    });
  };

  it("throws Forbidden when neither creator nor mentor is approved", async () => {
    wireSelects([[{ creatorStatus: "none", mentorStatus: "none" }]]);
    await expect(service.getCreatorDashboard("u1")).rejects.toThrow(
      "Creator access not granted.",
    );
  });

  it("returns stats for an approved mentor", async () => {
    // Query order in getCreatorDashboard: profile -> listings -> earnings
    // SUM -> recent earnings (limit 20) -> roadmaps.
    wireSelects([
      [{ creatorStatus: "none", mentorStatus: "approved", creditsBalance: 50 }], // profile
      [
        // listings
        { status: "active", enrollmentCount: 10 },
        { status: "pending", enrollmentCount: 0 },
      ],
      [{ total: 900 }], // earnings SUM
      [{ amount: 500 }], // recent earnings (limit 20)
      [
        // roadmaps
        {
          status: "published",
          enrollmentCount: 30,
          ratingAvg: "4.5",
          ratingCount: 2,
        },
        {
          status: "personal",
          enrollmentCount: 5,
          ratingAvg: "0",
          ratingCount: 0,
        },
      ],
    ]);
    const result = await service.getCreatorDashboard("u1");

    expect(result.stats.publishedContent).toBe(2); // 1 published roadmap + 1 active listing
    expect(result.stats.learnersReached).toBe(40); // 30 roadmap + 10 listing
    expect(result.stats.creditsEarned).toBe(900); // true SUM, not last-20 sum
    expect(result.stats.walletBalance).toBe(50);
    expect(result.stats.avgRating).toBe(4.5);
    expect(result.stats.ratingCount).toBe(2);
    expect(result.stats.mentorStatus).toBe("approved");

    // Bug fix: totalEarnings is the real lifetime SUM, not a reduce over the
    // last-20-rows page.
    expect(result.totalEarnings).toBe(900);
    expect(result.recentEarnings).toEqual([{ amount: 500 }]);
    expect(result.totalEnrollments).toBe(10);
    expect(result.totalListings).toBe(2);
  });

  it("passes the gate for an approved creator (non-mentor)", async () => {
    wireSelects([
      [{ creatorStatus: "approved", mentorStatus: "none", creditsBalance: 0 }], // profile
      [], // listings
      [{ total: 0 }], // earnings SUM
      [], // recent earnings
      [], // roadmaps
    ]);

    const result = await service.getCreatorDashboard("u1");

    expect(result.stats.mentorStatus).toBe("approved");
    expect(result.stats.publishedContent).toBe(0);
    expect(result.totalEarnings).toBe(0);
  });
});
