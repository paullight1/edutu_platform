import { db } from "../db";
import {
  EdutuApiBillingUnavailableError,
  EdutuApiUsageService,
  apiRequestIdempotencyKey,
} from "./edutu-api-usage.service";
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
    jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});
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
  // sequence: (1) set_config guard, (2) independent request-reference lookup,
  // (3) claim insert ... returning id, (4) if claimed -> update ... returning
  // credits, else -> select the matching ledger row, and (5) read the current
  // profile balance.
  function stubTransaction(opts: {
    claimed: boolean;
    balanceAfterDecrement?: number | null;
    currentBalance?: number;
    duplicateLedger?: Record<string, unknown> | null;
    duplicateLedgerMissing?: boolean;
    duplicateProfileMissing?: boolean;
  }) {
    const txExecute = jest.fn();
    txExecute.mockResolvedValueOnce({ rows: [] }); // set_config
    txExecute.mockResolvedValueOnce({ rows: [] }); // request-reference lookup
    txExecute.mockResolvedValueOnce({
      rows: opts.claimed ? [{ id: "ledger-1" }] : [], // claim insert
    });
    if (opts.claimed) {
      txExecute.mockResolvedValueOnce({
        rows:
          opts.balanceAfterDecrement === null
            ? [] // guarded decrement matched no row (exhausted)
            : [{ credits: opts.balanceAfterDecrement }],
      });
    } else {
      txExecute.mockResolvedValueOnce({
        rows: opts.duplicateLedgerMissing
          ? []
          : [
              opts.duplicateLedger ?? {
                id: "ledger-1",
                user_id: "user-1",
                api_consumer_id: "consumer-1",
                amount: -1,
                type: "spend",
                related_id: apiRequestIdempotencyKey(
                  "consumer-1",
                  "user-1",
                  "req-123",
                ),
                related_type: "api_request",
                api_request_idempotency_key: apiRequestIdempotencyKey(
                  "consumer-1",
                  "user-1",
                  "req-123",
                ),
              },
            ],
      });
      txExecute.mockResolvedValueOnce({
        rows: opts.duplicateProfileMissing
          ? []
          : [{ credits: opts.currentBalance ?? 0 }],
      });
    }
    if (opts.claimed && opts.balanceAfterDecrement === null) {
      txExecute.mockResolvedValueOnce({ rows: [{ credits: 0 }] });
    }
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

    expect(remaining).toEqual({ balance: 9, exhausted: false });
    // set_config + request-reference lookup + claim insert + decrement = 4.
    expect(txExecute).toHaveBeenCalledTimes(4);
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

    expect(remaining).toEqual({ balance: 42, exhausted: false });
    // set_config + request-reference lookup + claim (conflict no-op) +
    // matching-ledger read + current profile read = 5 statements.
    expect(txExecute).toHaveBeenCalledTimes(5);
  });

  it("charges the same request id independently for different owners", async () => {
    const persistedRequestKeys = new Set<string>();
    mockedDb.transaction.mockImplementation(async (callback: any) => {
      let claimed = false;
      const txExecute = jest.fn(async (statement: unknown) => {
        const text = (statement as { queryChunks?: unknown[] }).queryChunks
          ?.map((chunk) =>
            typeof chunk === "string"
              ? "$param"
              : ((chunk as { value?: string[] })?.value ?? []).join(""),
          )
          .join("");
        if (text?.includes("set_config")) return { rows: [] };
        if (text?.includes("from credit_transactions")) {
          return { rows: [] };
        }
        if (text?.includes("insert into credit_transactions")) {
          const chunks =
            (statement as { queryChunks?: unknown[] }).queryChunks ?? [];
          const requestKey = chunks.find(
            (chunk): chunk is string =>
              typeof chunk === "string" && chunk.startsWith("api:"),
          );
          claimed = !persistedRequestKeys.has(requestKey ?? "");
          if (claimed) persistedRequestKeys.add(requestKey ?? "");
          return { rows: claimed ? [{ id: "ledger-1" }] : [] };
        }
        return {
          rows: [
            {
              credits: claimed ? (persistedRequestKeys.size === 1 ? 9 : 8) : 8,
            },
          ],
        };
      });
      return callback({ execute: txExecute });
    });

    const firstOwner = billableConsumer;
    const secondOwner: ApiConsumerContext = {
      ...billableConsumer,
      id: "consumer-2",
      ownerUserId: "user-2",
    };

    const first = await service.reserveRequestCredit(
      firstOwner,
      "/v1/opportunities",
    );

    const second = await service.reserveRequestCredit(
      secondOwner,
      "/v1/opportunities",
    );

    expect(first).toEqual({ balance: 9, exhausted: false });
    expect(second).toEqual({ balance: 8, exhausted: false });
    expect(persistedRequestKeys.size).toBe(2);
    expect(
      apiRequestIdempotencyKey(
        firstOwner.id,
        firstOwner.ownerUserId!,
        firstOwner.requestId!,
      ),
    ).not.toBe(
      apiRequestIdempotencyKey(
        secondOwner.id,
        secondOwner.ownerUserId!,
        secondOwner.requestId!,
      ),
    );
  });

  it("fails closed when a duplicate ledger row belongs to another owner", async () => {
    stubTransaction({
      claimed: false,
      currentBalance: 42,
      duplicateLedger: {
        id: "ledger-1",
        user_id: "other-owner",
        amount: -1,
        type: "spend",
        related_id: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
        related_type: "api_request",
        api_request_idempotency_key: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
      },
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed when a duplicate claim has no ledger row to verify", async () => {
    stubTransaction({
      claimed: false,
      duplicateLedgerMissing: true,
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed when a duplicate ledger row has no current profile", async () => {
    stubTransaction({
      claimed: false,
      duplicateProfileMissing: true,
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed when a duplicate ledger row is not a one-credit spend", async () => {
    stubTransaction({
      claimed: false,
      currentBalance: 42,
      duplicateLedger: {
        id: "ledger-1",
        user_id: "user-1",
        api_consumer_id: "consumer-1",
        amount: -2,
        type: "spend",
        related_id: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
        related_type: "api_request",
        api_request_idempotency_key: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
      },
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed when a duplicate ledger key belongs to another consumer", async () => {
    stubTransaction({
      claimed: false,
      currentBalance: 42,
      duplicateLedger: {
        id: "ledger-1",
        user_id: "user-1",
        api_consumer_id: "consumer-2",
        amount: -1,
        type: "spend",
        related_id: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
        related_type: "api_request",
        api_request_idempotency_key: apiRequestIdempotencyKey(
          billableConsumer.id,
          billableConsumer.ownerUserId!,
          billableConsumer.requestId!,
        ),
      },
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed instead of recharging an unscoped legacy API ledger row", async () => {
    mockedDb.transaction.mockImplementation(async (callback: any) => {
      const txExecute = jest.fn(async (statement: unknown) => {
        const text = (statement as { queryChunks?: unknown[] }).queryChunks
          ?.map((chunk) =>
            typeof chunk === "string"
              ? "$param"
              : ((chunk as { value?: string[] })?.value ?? []).join(""),
          )
          .join("");
        if (text?.includes("set_config")) return { rows: [] };
        if (text?.includes("from credit_transactions")) {
          return {
            rows: [
              {
                id: "legacy-ledger-1",
                user_id: "user-1",
                amount: -1,
                type: "spend",
                related_id: "req-123",
                related_type: "api_request",
                api_request_idempotency_key: null,
              },
            ],
          };
        }
        if (text?.includes("insert into credit_transactions")) {
          return { rows: [{ id: "new-ledger-1" }] };
        }
        return { rows: [{ credits: 9 }] };
      });
      return callback({ execute: txExecute });
    });

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("fails closed when the request id is missing", async () => {
    await expect(
      service.reserveRequestCredit(
        { ...billableConsumer, requestId: undefined },
        "/v1/opportunities",
      ),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("signals exhaustion and does not persist a charge when credits run out", async () => {
    // Claimed the ledger row, but the guarded decrement matched no row.
    const { txExecute } = stubTransaction({
      claimed: true,
      balanceAfterDecrement: null,
    });

    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/opportunities",
    );

    expect(remaining).toEqual({ balance: 0, exhausted: true }); // InsufficientCreditsError rolls back the tx
    expect(txExecute).toHaveBeenCalledTimes(5);
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

    expect(remaining).toEqual({ balance: 17, exhausted: false });
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("fails closed when a database-backed consumer has no owner", async () => {
    await expect(
      service.reserveRequestCredit(
        {
          id: "consumer-without-owner",
          name: "Misconfigured consumer",
          plan: "starter",
          scopes: ["*"],
          monthlyQuota: 1000,
        },
        "/v1/opportunities",
      ),
    ).rejects.toBeInstanceOf(EdutuApiBillingUnavailableError);

    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it("maps reservation database failures to billing_unavailable", async () => {
    mockedDb.transaction.mockRejectedValue(new Error("database offline"));

    await expect(
      service.reserveRequestCredit(billableConsumer, "/v1/opportunities"),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
  });

  it("does not charge categories because categories are free", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [{ credits: 17 }] });
    const remaining = await service.reserveRequestCredit(
      billableConsumer,
      "/v1/categories",
    );

    expect(remaining).toEqual({ balance: 17, exhausted: false });
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
