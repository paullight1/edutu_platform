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
  execute: jest.Mock;
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

  // Models the raw-SQL flow inside db.transaction(cb). tx.execute is called in
  // sequence: (1) set_config guard, (2) claim insert ... returning id, (3) if
  // claimed -> update ... returning credits, else -> select credits.
  function stubTransaction(opts: {
    claimed: boolean;
    balanceAfterDecrement?: number | null;
    currentBalance?: number;
  }) {
    const txExecute = jest.fn();
    txExecute.mockResolvedValueOnce({ rows: [] }); // set_config
    txExecute.mockResolvedValueOnce({
      rows: opts.claimed ? [{ id: "ledger-1" }] : [], // claim insert
    });
    txExecute.mockResolvedValueOnce(
      opts.claimed
        ? {
            rows:
              opts.balanceAfterDecrement === null
                ? [] // guarded decrement matched no row (exhausted)
                : [{ credits: opts.balanceAfterDecrement }],
          }
        : { rows: [{ credits: opts.currentBalance ?? 0 }] }, // current balance read
    );
    const tx = { execute: txExecute };
    mockedDb.transaction.mockImplementation(async (cb: any) => cb(tx));
    return { txExecute };
  }

  it("deducts one API credit for a billable request (first delivery)", async () => {
    const { txExecute } = stubTransaction({
      claimed: true,
      balanceAfterDecrement: 9,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toBe(9);
    // set_config + claim insert + decrement = 3 statements.
    expect(txExecute).toHaveBeenCalledTimes(3);
  });

  it("does not double-charge when the same request id is retried (idempotent)", async () => {
    // Distinct currentBalance proves it read the balance and did NOT decrement.
    const { txExecute } = stubTransaction({
      claimed: false,
      currentBalance: 42,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toBe(42);
    // set_config + claim (conflict no-op) + current-balance read = 3 statements,
    // the third being a SELECT, not a decrementing UPDATE.
    expect(txExecute).toHaveBeenCalledTimes(3);
  });

  it("returns null and does not persist a charge when credits are exhausted", async () => {
    // Claimed the ledger row, but the guarded decrement matched no row.
    const { txExecute } = stubTransaction({
      claimed: true,
      balanceAfterDecrement: null,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toBeNull(); // InsufficientCreditsError rolls back the tx
    expect(txExecute).toHaveBeenCalledTimes(3);
  });

  it("reads the balance for credit-free endpoints without deducting", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [{ credits: 17 }] });

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
    expect(mockedDb.transaction).not.toHaveBeenCalled();
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
