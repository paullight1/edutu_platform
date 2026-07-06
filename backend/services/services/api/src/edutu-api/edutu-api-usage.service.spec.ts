import { db } from "../db";
import { EdutuApiUsageService } from "./edutu-api-usage.service";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
  transaction: jest.Mock;
};

describe("EdutuApiUsageService", () => {
  let service: EdutuApiUsageService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EdutuApiUsageService();
  });

  const billableConsumer: ApiConsumerContext = {
    id: "consumer-1",
    name: "Scholarship Engine",
    plan: "starter",
    scopes: ["opportunities:read"],
    monthlyQuota: 1000,
    ownerUserId: "user-1",
    requestId: "req-123",
  };

  // Builds a fake tx object for db.transaction(cb). `claimed` controls whether
  // the ledger-insert claim inserted a new row (first delivery) or hit the
  // unique index (retry). `balance` is what the decrement returns.
  function stubTransaction(opts: {
    claimed: boolean;
    balanceAfterDecrement?: number | null;
    currentBalance?: number;
  }) {
    const txExecute = jest.fn().mockResolvedValue({
      rowCount: opts.claimed ? 1 : 0,
      rows: opts.claimed ? [{ id: "ledger-1" }] : [],
    });
    const decReturning = jest
      .fn()
      .mockResolvedValue(
        opts.balanceAfterDecrement === null
          ? []
          : [{ creditsBalance: opts.balanceAfterDecrement }],
      );
    const decWhere = jest.fn().mockReturnValue({ returning: decReturning });
    const set = jest.fn().mockReturnValue({ where: decWhere });
    const update = jest.fn().mockReturnValue({ set });
    const selLimit = jest
      .fn()
      .mockResolvedValue([{ creditsBalance: opts.currentBalance ?? 0 }]);
    const selWhere = jest.fn().mockReturnValue({ limit: selLimit });
    const selFrom = jest.fn().mockReturnValue({ where: selWhere });
    const select = jest.fn().mockReturnValue({ from: selFrom });
    const tx = { execute: txExecute, update, select, insert: jest.fn() };
    mockedDb.transaction.mockImplementation(async (cb: any) => cb(tx));
    return { txExecute, update, set };
  }

  it("deducts one API credit for billable endpoints and records a transaction", async () => {
    const { txExecute, set, update } = stubTransaction({
      claimed: true,
      balanceAfterDecrement: 9,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toBe(9);
    expect(txExecute).toHaveBeenCalledTimes(1); // ledger claim insert
    expect(update).toHaveBeenCalledTimes(1); // balance decrement
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("does not double-charge when the same request id is retried (idempotent)", async () => {
    const { update } = stubTransaction({ claimed: false, currentBalance: 9 });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    // Retry: report current balance, never decrement again.
    expect(remaining).toBe(9);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null and does not persist a charge when credits are exhausted", async () => {
    // Claimed the ledger row, but the guarded decrement matched no row.
    const { update } = stubTransaction({
      claimed: true,
      balanceAfterDecrement: null,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toBeNull(); // InsufficientCreditsError rolls back the tx
    expect(update).toHaveBeenCalledTimes(1);
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
    const consumer: ApiConsumerContext = {
      id: "consumer-rl",
      name: "RL",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: 1000,
      rateLimitPerMinute: 3,
    };

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
