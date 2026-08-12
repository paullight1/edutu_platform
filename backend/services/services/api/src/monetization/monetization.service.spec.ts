import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { db } from "../db";
import { DEFAULT_ADMIN_SETTINGS } from "../settings/settings.dto";
import { MonetizationService } from "./monetization.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  execute: jest.Mock;
  transaction: jest.Mock;
};

// Flatten a drizzle `sql` expression back to its literal text so the db mock
// can route by which statement is being run (see roadmaps.service.spec.ts).
const collectSqlText = (expression: any): string => {
  if (!expression?.queryChunks) return "";
  return expression.queryChunks
    .map((chunk: any) => {
      if (Array.isArray(chunk?.value)) return chunk.value.join("");
      return collectSqlText(chunk);
    })
    .join("");
};

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

interface Scenario {
  // Row returned by the combined billing/profile lookup.
  billing: { is_pro: boolean | null; created_at: string | null };
  // chat_messages the daily-usage upsert reports back after the bump.
  chatMessages: number;
  // Whether the credit debit should succeed (row updated) or run dry.
  debitSucceeds?: boolean;
  // Voice minutes already consumed in today's atomic voice counter.
  voiceMinutes?: number;
}

let debitCalls: number;

const setup = (scenario: Scenario): MonetizationService => {
  debitCalls = 0;
  const usage = {
    chat_messages: scenario.chatMessages,
    action_credits: 0,
    voice_minutes: scenario.voiceMinutes ?? 0,
  };

  const route = (text: string): { rows: unknown[] } => {
    if (text.includes("billing_entitlements")) {
      return {
        rows: [
          {
            is_pro: scenario.billing.is_pro,
            created_at: scenario.billing.created_at,
          },
        ],
      };
    }
    if (text.includes("user_ai_usage_daily")) {
      return { rows: [usage] };
    }
    if (text.includes("update profiles")) {
      debitCalls += 1;
      return {
        rows: scenario.debitSucceeds === false ? [] : [{ credits: 40 }],
      };
    }
    return { rows: [] };
  };

  mockedDb.execute.mockImplementation((expr: any) =>
    Promise.resolve(route(collectSqlText(expr))),
  );
  mockedDb.transaction.mockImplementation(async (cb: any) => {
    const tx = {
      execute: (expr: any) => Promise.resolve(route(collectSqlText(expr))),
    };
    return cb(tx);
  });

  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      settings: { pricing: DEFAULT_ADMIN_SETTINGS.pricing },
    }),
  };
  return new MonetizationService(settingsService as any);
};

describe("MonetizationService new-user chat grace", () => {
  const OLD_ENV = process.env.FREE_CHAT_GRACE_DAYS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FREE_CHAT_GRACE_DAYS;
  });

  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.FREE_CHAT_GRACE_DAYS;
    else process.env.FREE_CHAT_GRACE_DAYS = OLD_ENV;
  });

  it("gives a day-3 free user unmetered chat beyond the 10/day free tier", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(3) },
      chatMessages: 25, // well past the 10/day free allowance
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(0);
    expect(charge.ledgerId).toBeNull();
    expect(debitCalls).toBe(0); // no credit debit during grace
  });

  it("still records usage during grace (bumpDailyUsage runs)", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(3) },
      chatMessages: 25,
    });

    await service.meter("user-1", "chatMessage");

    const bumped = mockedDb.execute.mock.calls.some((call) =>
      collectSqlText(call[0]).includes("user_ai_usage_daily"),
    );
    expect(bumped).toBe(true);
  });

  it("meters normally once the grace window has passed (day 10)", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(10) },
      chatMessages: 25,
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(
      DEFAULT_ADMIN_SETTINGS.pricing.aiCosts.chatMessage,
    );
    expect(debitCalls).toBe(1);
  });

  it("meters normally when FREE_CHAT_GRACE_DAYS=0 disables the grace", async () => {
    process.env.FREE_CHAT_GRACE_DAYS = "0";
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(3) },
      chatMessages: 25,
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(
      DEFAULT_ADMIN_SETTINGS.pricing.aiCosts.chatMessage,
    );
    expect(debitCalls).toBe(1);
  });

  it("falls back to a malformed FREE_CHAT_GRACE_DAYS as the default 7 (grace active on day 3)", async () => {
    process.env.FREE_CHAT_GRACE_DAYS = "not-a-number";
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(3) },
      chatMessages: 25,
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(0);
    expect(debitCalls).toBe(0);
  });

  it("does NOT extend grace to non-chat actions during the window", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(3) },
      chatMessages: 0,
    });

    const charge = await service.meter("user-1", "roadmapGeneration");

    expect(charge.charged).toBe(
      DEFAULT_ADMIN_SETTINGS.pricing.aiCosts.roadmapGeneration,
    );
    expect(debitCalls).toBe(1);
  });

  it("does NOT grant grace when created_at is missing (fails toward metering)", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: null },
      chatMessages: 25,
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(
      DEFAULT_ADMIN_SETTINGS.pricing.aiCosts.chatMessage,
    );
    expect(debitCalls).toBe(1);
  });

  it("leaves the Pro fair-use path unchanged (no grace, no debit, charged 0)", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(3) },
      chatMessages: 5, // under the 200/day Pro fair-use cap
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(0);
    expect(debitCalls).toBe(0);
  });

  it("still enforces Pro fair-use beyond the daily cap", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(3) },
      chatMessages:
        DEFAULT_ADMIN_SETTINGS.pricing.proFairUse.dailyChatMessages + 1,
    });

    await expect(service.meter("user-1", "chatMessage")).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it("keeps the within-free-tier free chat free (day 10, under 10/day)", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(10) },
      chatMessages: 3,
    });

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.charged).toBe(0);
    expect(debitCalls).toBe(0);
  });
});

describe("MonetizationService voice metering and premium authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([1, 2])(
    "counts %i server-derived started voice minute unit(s) against Pro usage",
    async (units) => {
      const service = setup({
        billing: { is_pro: true, created_at: daysAgoIso(10) },
        chatMessages: 0,
        voiceMinutes: units,
      });

      await expect(
        service.meter("user-1", "voicePerMinute", units),
      ).resolves.toMatchObject({
        charged: 0,
        actionCredited: 0,
        voiceMinutesCredited: units,
      });
      expect(
        mockedDb.execute.mock.calls.some((call) =>
          collectSqlText(call[0]).includes("voice_minutes"),
        ),
      ).toBe(true);
    },
  );

  it("rejects voice for a non-Pro user even when credits are available", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });

    await expect(
      service.meter("user-1", "voicePerMinute", 1),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(debitCalls).toBe(0);
  });

  it("requires the edge function to provide server-derived units", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });

    await expect(
      service.meter("user-1", "voicePerMinute"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an atomic voice-minute reservation that would exceed the Pro cap", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });
    mockedDb.execute.mockImplementation((expr: any) => {
      const text = collectSqlText(expr);
      if (text.includes("billing_entitlements")) {
        return Promise.resolve({
          rows: [{ is_pro: true, created_at: daysAgoIso(10) }],
        });
      }
      if (text.includes("voice_minutes")) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    await expect(
      service.meter("user-1", "voicePerMinute", 1),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: "limit", error: "voice_fair_use_exceeded" },
    });
  });

  it("applies the conservative 5 provider-minute daily default", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });

    await expect(
      service.meter("user-1", "voicePerMinute", 6),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { error: "voice_fair_use_exceeded" },
    });
  });

  it.each([0, -1, 1.5, 121, Number.NaN])(
    "rejects an invalid started-minute unit count of %p",
    async (units) => {
      const service = setup({
        billing: { is_pro: false, created_at: daysAgoIso(10) },
        chatMessages: 0,
      });

      await expect(
        service.meter("user-1", "voicePerMinute", units),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it("rejects units for a non-voice action", async () => {
    const service = setup({
      billing: { is_pro: false, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });

    await expect(service.meter("user-1", "cvAi", 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("authorizes premium voice from an active canonical entitlement", async () => {
    const service = setup({
      billing: { is_pro: true, created_at: daysAgoIso(10) },
      chatMessages: 0,
    });

    await expect(
      service.authorizeVoicePremium("user-1"),
    ).resolves.toBeUndefined();
  });

  it("denies premium voice when only a stale profile flag is present", async () => {
    mockedDb.execute.mockImplementation((expr: any) => {
      const text = collectSqlText(expr);
      if (text.includes("billing_entitlements")) {
        // This fixture makes a stale profile flag look Pro only to an
        // implementation that consults profiles.is_pro. The canonical
        // entitlement query must therefore deny it.
        return Promise.resolve({
          rows: [
            {
              is_pro: text.includes("p.is_pro"),
              created_at: daysAgoIso(10),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const service = new MonetizationService({
      getSettings: jest.fn(),
    } as any);

    await expect(service.authorizeVoicePremium("user-1")).rejects.toMatchObject(
      {
        status: HttpStatus.FORBIDDEN,
      },
    );
  });

  it("fails closed when the canonical entitlement lookup is unavailable", async () => {
    mockedDb.execute.mockRejectedValue(new Error("connection terminated"));
    const service = new MonetizationService({
      getSettings: jest.fn(),
    } as any);

    await expect(service.authorizeVoicePremium("user-1")).rejects.toMatchObject(
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        response: { code: "billing_unavailable" },
      },
    );
  });
});
