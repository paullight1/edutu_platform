import { db } from "../db";
import { EdutuApiUsageService } from "./edutu-api-usage.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
};

describe("EdutuApiUsageService", () => {
  let service: EdutuApiUsageService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EdutuApiUsageService();
  });

  it("deducts one API credit for billable endpoints and records a transaction", async () => {
    const execute = jest.fn().mockResolvedValue([{ creditsBalance: 9 }]);
    const returning = jest.fn().mockReturnValue({ execute });
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });
    const transactionExecute = jest.fn().mockResolvedValue([]);
    const values = jest.fn().mockReturnValue({ execute: transactionExecute });
    mockedDb.insert.mockReturnValue({ values });

    const remaining = await service.reserveRequestCredit(
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        plan: "starter",
        scopes: ["opportunities:read"],
        monthlyQuota: 1000,
        ownerUserId: "user-1",
        requestId: "req-123",
      },
      "/v1/opportunities",
    );

    expect(remaining).toBe(9);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: expect.any(Date),
      }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: -1,
        type: "api_request",
        referenceId: "req-123",
      }),
    );
  });

  it("reads the balance for credit-free endpoints without deducting", async () => {
    const execute = jest.fn().mockResolvedValue([{ creditsBalance: 17 }]);
    const limit = jest.fn().mockReturnValue({ execute });
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValue({ from });

    const remaining = await service.reserveRequestCredit(
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        plan: "starter",
        scopes: ["usage:read"],
        monthlyQuota: 1000,
        ownerUserId: "user-1",
      },
      "/v1/usage",
    );

    expect(remaining).toBe(17);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  describe("reserveRateLimit", () => {
    const consumer = {
      id: "consumer-rl",
      name: "RL",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: 1000,
      rateLimitPerMinute: 3,
    } as const;

    it("allows requests up to the limit then denies with a retry window", () => {
      const first = service.reserveRateLimit(consumer);
      const second = service.reserveRateLimit(consumer);
      const third = service.reserveRateLimit(consumer);
      const fourth = service.reserveRateLimit(consumer);

      expect(first.allowed).toBe(true);
      expect(first.remaining).toBe(2);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(true);
      expect(third.remaining).toBe(0);

      expect(fourth.allowed).toBe(false);
      expect(fourth.limit).toBe(3);
      expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it("emits X-RateLimit-Limit and a resetAt ISO timestamp", () => {
      const result = service.reserveRateLimit(consumer);
      expect(result.limit).toBe(3);
      expect(new Date(result.resetAt).toISOString()).toBe(result.resetAt);
    });

    it("does not rate-limit env or unlimited consumers", () => {
      const env = service.reserveRateLimit({
        ...consumer,
        id: "env",
        rateLimitPerMinute: null,
      });
      expect(env.allowed).toBe(true);
      expect(env.limit).toBe(0);

      const unlimited = service.reserveRateLimit({
        ...consumer,
        id: "consumer-unlimited",
        rateLimitPerMinute: null,
      });
      expect(unlimited.allowed).toBe(true);
    });

    it("resets the window after the window elapses", () => {
      jest.useFakeTimers();
      try {
        const before = service.reserveRateLimit({ ...consumer, id: "reset-1" });
        expect(before.allowed).toBe(true);

        jest.advanceTimersByTime(61_000);

        const after = service.reserveRateLimit({ ...consumer, id: "reset-1" });
        expect(after.allowed).toBe(true);
        expect(after.remaining).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
