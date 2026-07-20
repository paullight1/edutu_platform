import { HttpStatus, Logger } from "@nestjs/common";
import { MonetizationService } from "./monetization.service";
import { DEFAULT_ADMIN_SETTINGS } from "../settings/settings.dto";
import type { SettingsService } from "../settings/settings.service";

// Same db stub shape as monetization.metering.spec.ts: real control flow, no
// connection, every rendered SQL string recorded so the daily-counter upsert,
// the counter release and the credit debit can be told apart.
jest.mock("../db", () => {
  const executed: string[] = [];
  (globalThis as Record<string, any>).__rollbackSql = executed;
  const handlers: Record<string, any> = {};
  (globalThis as Record<string, any>).__rollbackHandlers = handlers;

  const render = (query: any): string =>
    ((query?.queryChunks ?? []) as any[])
      .map((chunk) =>
        typeof chunk === "string"
          ? chunk
          : Array.isArray(chunk?.value)
            ? chunk.value.join("")
            : typeof chunk?.queryChunks !== "undefined"
              ? render(chunk)
              : "",
      )
      .join("");

  const execute = async (query: any) => {
    const text = render(query);
    executed.push(text);
    return handlers.execute ? handlers.execute(text) : { rows: [] };
  };

  return {
    db: {
      execute,
      transaction: async (fn: (tx: any) => Promise<unknown>) =>
        handlers.transaction
          ? handlers.transaction(fn, { execute })
          : fn({ execute }),
    },
  };
});

const executedSql = (): string[] =>
  (globalThis as Record<string, any>).__rollbackSql;
const handlers = (): Record<string, any> =>
  (globalThis as Record<string, any>).__rollbackHandlers;

const PRICING = DEFAULT_ADMIN_SETTINGS.pricing;

function buildService(): MonetizationService {
  return new MonetizationService({
    getSettings: async () => ({ settings: DEFAULT_ADMIN_SETTINGS }),
  } as unknown as SettingsService);
}

const releaseQueries = () =>
  executedSql().filter(
    (text) =>
      text.includes("update user_ai_usage_daily") && text.includes("greatest"),
  );

describe("MonetizationService — meter() releases the counter on refusal", () => {
  beforeEach(() => {
    executedSql().length = 0;
    delete handlers().execute;
    delete handlers().transaction;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  // A Pro user over the fair-use cap has already had bumpDailyUsage applied,
  // but is handed no MeterCharge — so nothing could ever roll it back, and
  // every rejected request pushed the counter further past the cap.
  it("hands back the Pro fair-use bump when the request is refused with 429", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("billing_entitlements")) return { rows: [{}] };
      if (text.includes("insert into user_ai_usage_daily")) {
        return {
          rows: [
            {
              day: "2026-07-20",
              chat_messages: PRICING.proFairUse.dailyChatMessages + 1,
              action_credits: 0,
            },
          ],
        };
      }
      return { rows: [] };
    };

    await expect(service.meter("user-1", "chatMessage")).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { error: "fair_use_exceeded" },
    });

    expect(releaseQueries()).toHaveLength(1);
  });

  it("hands back the Pro action-credit bump when the request is refused", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("billing_entitlements")) return { rows: [{}] };
      if (text.includes("insert into user_ai_usage_daily")) {
        return {
          rows: [
            {
              day: "2026-07-20",
              chat_messages: 0,
              action_credits: PRICING.proFairUse.dailyActionCredits + 5,
            },
          ],
        };
      }
      return { rows: [] };
    };

    await expect(
      service.meter("user-1", "copilotAssist"),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(releaseQueries()).toHaveLength(1);
  });

  // A free user past the allowance is counted first, then asked to pay. If the
  // debit refuses (insufficient credits) the turn never happens, so the message
  // must not be consumed.
  it("hands back the free-tier chat bump when the credit debit refuses", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("insert into user_ai_usage_daily")) {
        return {
          rows: [
            {
              day: "2026-07-20",
              chat_messages: PRICING.freeTier.dailyChatMessages + 1,
              action_credits: 0,
            },
          ],
        };
      }
      // Zero rows from the guarded debit = insufficient credits.
      if (text.includes("update profiles")) return { rows: [] };
      return { rows: [] };
    };

    await expect(service.meter("user-1", "chatMessage")).rejects.toMatchObject({
      response: { error: "insufficient_credits" },
    });

    expect(releaseQueries()).toHaveLength(1);
  });

  // FAIL-CLOSED, unchanged: a billing OUTAGE still 503s, and deliberately gets
  // no rollback — a silent compensation there could mask a billing failure.
  it("still 503s on a billing outage and does not roll the counter back", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("insert into user_ai_usage_daily")) {
        return {
          rows: [
            {
              day: "2026-07-20",
              chat_messages: PRICING.freeTier.dailyChatMessages + 1,
              action_credits: 0,
            },
          ],
        };
      }
      return { rows: [] };
    };
    handlers().transaction = async () => {
      throw new Error("connection terminated unexpectedly");
    };

    await expect(service.meter("user-1", "chatMessage")).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "billing_unavailable" },
    });

    expect(releaseQueries()).toHaveLength(0);
  });

  // A turn that starts at 23:59:58 and fails at 00:00:01 must not decrement the
  // NEW day's counter — that would gift the user a message every midnight.
  it("rolls back against the day the bump landed on, not current_date", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("insert into user_ai_usage_daily")) {
        return {
          rows: [{ day: "2026-07-19", chat_messages: 1, action_credits: 0 }],
        };
      }
      return { rows: [] };
    };

    const charge = await service.meter("user-1", "chatMessage");
    expect(charge.day).toBe("2026-07-19");

    executedSql().length = 0;
    await service.refund(charge);

    const release = releaseQueries()[0];
    expect(release).toBeDefined();
    expect(release).toContain("::date");
    expect(release).not.toContain("current_date");
  });
});

// A Pro user pays for cvAi/copilotKit with the daily action-credit counter, not
// with credits — so a failed turn used to leave the bump inflated forever, with
// no path to correct it. refund() now releases it the same way it releases a
// chat message.
describe("MonetizationService — refund() releases the Pro action-credit bump", () => {
  const proUsage = (actionCredits: number) => (text: string) => {
    if (text.includes("billing_entitlements")) return { rows: [{}] };
    if (text.includes("insert into user_ai_usage_daily")) {
      return {
        rows: [
          {
            day: "2026-07-20",
            chat_messages: 0,
            action_credits: actionCredits,
          },
        ],
      };
    }
    return { rows: [] };
  };

  beforeEach(() => {
    executedSql().length = 0;
    delete handlers().execute;
    delete handlers().transaction;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("hands back the bump when a cvAi turn fails after being metered", async () => {
    const service = buildService();
    handlers().execute = proUsage(PRICING.aiCosts.cvAi);

    const charge = await service.meter("user-1", "cvAi");
    expect(charge.actionCredited).toBe(PRICING.aiCosts.cvAi);
    // Metering a turn that is allowed to proceed releases nothing.
    expect(releaseQueries()).toHaveLength(0);

    await service.refund(charge);
    expect(releaseQueries()).toHaveLength(1);
  });

  it("releases nothing when the action succeeds (refund is never called)", async () => {
    const service = buildService();
    handlers().execute = proUsage(PRICING.aiCosts.copilotKit);

    await service.meter("user-1", "copilotKit");

    expect(releaseQueries()).toHaveLength(0);
  });

  // Exactly-once: the markers are cleared synchronously before the release is
  // awaited, so two callers racing on the same failed charge cannot double-fire.
  it("releases exactly once per failed charge, even under concurrent refunds", async () => {
    const service = buildService();
    handlers().execute = proUsage(PRICING.aiCosts.cvAi);

    const first = await service.meter("user-1", "cvAi");
    const second = await service.meter("user-1", "cvAi");
    executedSql().length = 0;

    await Promise.all([
      service.refund(first),
      service.refund(first),
      service.refund(second),
      service.refund(second),
    ]);

    // Two distinct failures → two bumps → exactly two releases, not four.
    expect(releaseQueries()).toHaveLength(2);
  });

  it("still refunds credits for a non-Pro action without touching the counter", async () => {
    const service = buildService();
    handlers().execute = (text: string) =>
      text.includes("billing_entitlements")
        ? { rows: [] }
        : { rows: [{ credits: 10 }] };

    const charge = await service.meter("user-1", "cvAi");
    expect(charge.charged).toBe(PRICING.aiCosts.cvAi);
    expect(charge.actionCredited ?? 0).toBe(0);

    executedSql().length = 0;
    await service.refund(charge);

    expect(releaseQueries()).toHaveLength(0);
    expect(
      executedSql().filter((text) => text.includes("credits = credits +")),
    ).toHaveLength(1);
  });
});
