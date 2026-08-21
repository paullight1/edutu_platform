import { db } from "../db";
import { EdutuApiRateLimitService } from "./edutu-api-rate-limit.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
  },
}));

const mockedDb = db as unknown as { execute: jest.Mock };

function consumer(limit = 2) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "user-1",
    name: "test consumer",
    scopes: ["opportunities:read"],
    monthlyQuota: 1000,
    rateLimitPerMinute: limit,
    requestId: "req-1",
  } as any;
}

describe("EdutuApiRateLimitService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("uses the shared database bucket across service instances", async () => {
    let sharedCount = 0;
    mockedDb.execute.mockImplementation(async () => {
      if (sharedCount >= 2) return { rows: [] };
      sharedCount += 1;
      return {
        rows: [
          {
            request_count: sharedCount,
            window_start: "2026-08-21T06:10:00.000Z",
          },
        ],
      };
    });

    const firstReplica = new EdutuApiRateLimitService();
    const secondReplica = new EdutuApiRateLimitService();

    await expect(firstReplica.reserve(consumer())).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
    });
    await expect(secondReplica.reserve(consumer())).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 0,
    });
    await expect(firstReplica.reserve(consumer())).resolves.toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
    });
    expect(mockedDb.execute).toHaveBeenCalledTimes(3);
  });

  it("bypasses database accounting for internal env consumers", async () => {
    const service = new EdutuApiRateLimitService();

    await expect(
      service.reserve({
        ...consumer(),
        id: "env",
        rateLimitPerMinute: null,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      limit: 0,
      retryAfterSeconds: 0,
    });
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("treats an unconfigured rate limit as unlimited", async () => {
    const service = new EdutuApiRateLimitService();

    await expect(
      service.reserve({ ...consumer(), rateLimitPerMinute: null }),
    ).resolves.toMatchObject({
      allowed: true,
      limit: 0,
      retryAfterSeconds: 0,
    });
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("fails closed when a configured shared limiter cannot reach the database", async () => {
    mockedDb.execute.mockRejectedValue(new Error("database unavailable"));
    const service = new EdutuApiRateLimitService();

    await expect(service.reserve(consumer())).rejects.toThrow(
      "API rate limit unavailable",
    );
  });
});
