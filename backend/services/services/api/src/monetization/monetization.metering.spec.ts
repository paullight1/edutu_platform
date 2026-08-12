import { BadRequestException, HttpStatus, Logger } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { firstValueFrom, of, throwError } from "rxjs";
import { MonetizationService } from "./monetization.service";
import { AiMeteringInterceptor } from "./ai-metering.interceptor";
import { DEFAULT_ADMIN_SETTINGS } from "../settings/settings.dto";
import type { SettingsService } from "../settings/settings.service";
import { MonetizationController } from "./monetization.controller";

// Every metering query goes through db.execute / db.transaction. Stub the
// module so the service runs its real control flow with no connection, and
// record the SQL each call produced so a test can tell the daily-counter
// upsert, the counter release and the credit debit apart.
jest.mock("../db", () => {
  const executed: string[] = [];
  (globalThis as Record<string, any>).__meterSql = executed;
  const handlers: Record<string, any> = {};
  (globalThis as Record<string, any>).__meterHandlers = handlers;

  const render = (query: any): string =>
    ((query?.queryChunks ?? []) as any[])
      .map((chunk) =>
        typeof chunk === "string"
          ? chunk
          : Array.isArray(chunk?.value)
            ? chunk.value.join("")
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
  (globalThis as Record<string, any>).__meterSql;
const handlers = (): Record<string, any> =>
  (globalThis as Record<string, any>).__meterHandlers;

const PRICING = DEFAULT_ADMIN_SETTINGS.pricing;

function buildService(): MonetizationService {
  const settingsService = {
    getSettings: async () => ({ settings: DEFAULT_ADMIN_SETTINGS }),
  } as unknown as SettingsService;
  return new MonetizationService(settingsService);
}

/** Drives db.execute: not Pro, and the daily upsert returns `chatMessages`. */
function usageOf(chatMessages: number, actionCredits = 0) {
  return (text: string) => {
    if (text.includes("user_ai_usage_daily")) {
      return {
        rows: [{ chat_messages: chatMessages, action_credits: actionCredits }],
      };
    }
    // isPro lookup + everything else: no rows (free user).
    return { rows: [] };
  };
}

describe("MonetizationService — free-tier meter fairness", () => {
  beforeEach(() => {
    executedSql().length = 0;
    handlers().execute = usageOf(1);
    delete handlers().transaction;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("restores the free-tier daily chat counter when the turn fails", async () => {
    const service = buildService();
    const charge = await service.meter("user-1", "chatMessage");
    expect(charge.charged).toBe(0);

    executedSql().length = 0;
    await service.refund(charge);

    const release = executedSql().find(
      (text) =>
        text.includes("update user_ai_usage_daily") &&
        text.includes("chat_messages"),
    );
    expect(release).toBeDefined();
    // Never below zero: the day may have rolled over since the turn started.
    expect(release).toContain("greatest");
  });

  it("does not touch the daily counter for a non-chat action", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("user_ai_usage_daily")) {
        return { rows: [{ chat_messages: 0, action_credits: 0 }] };
      }
      if (text.includes("update profiles")) return { rows: [{ credits: 40 }] };
      return { rows: [] };
    };

    const charge = await service.meter("user-1", "copilotAssist");
    expect(charge.charged).toBe(PRICING.aiCosts.copilotAssist);

    executedSql().length = 0;
    await service.refund(charge);

    expect(
      executedSql().some((text) => text.includes("update user_ai_usage_daily")),
    ).toBe(false);
  });

  it("reports the remaining free-tier chat allowance", async () => {
    const service = buildService();
    handlers().execute = usageOf(3);

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.remaining).toBe(PRICING.freeTier.dailyChatMessages - 3);
  });

  it("reports zero remaining rather than a negative allowance", async () => {
    const service = buildService();
    handlers().execute = (text: string) => {
      if (text.includes("user_ai_usage_daily")) {
        return {
          rows: [
            {
              chat_messages: PRICING.freeTier.dailyChatMessages + 4,
              action_credits: 0,
            },
          ],
        };
      }
      if (text.includes("update profiles")) return { rows: [{ credits: 10 }] };
      return { rows: [] };
    };

    const charge = await service.meter("user-1", "chatMessage");

    expect(charge.remaining).toBe(0);
  });

  // The fairness fix must not weaken the invariant: a billing outage still
  // refuses service (503) instead of handing out free AI.
  it("still fails closed with 503 when the credit ledger is unavailable", async () => {
    const service = buildService();
    handlers().execute = usageOf(PRICING.freeTier.dailyChatMessages + 1);
    handlers().transaction = async () => {
      throw new Error("connection terminated unexpectedly");
    };

    await expect(service.meter("user-1", "chatMessage")).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "billing_unavailable" },
    });
  });
});

describe("AiMeteringInterceptor", () => {
  const buildContext = (response: Record<string, any>) =>
    ({
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "user-1" } }),
        getResponse: () => response,
      }),
    }) as any;

  const buildInterceptor = (monetization: Partial<MonetizationService>) =>
    new AiMeteringInterceptor(
      { get: () => "chatMessage" } as unknown as Reflector,
      monetization as MonetizationService,
    );

  it("exposes the remaining allowance on the response header", async () => {
    const headers: Record<string, string> = {};
    const interceptor = buildInterceptor({
      meter: jest.fn(async () => ({
        userId: "user-1",
        action: "chatMessage" as const,
        charged: 0,
        ledgerId: null,
        chatCounted: true,
        remaining: 4,
      })),
      refund: jest.fn(async () => undefined),
    });

    const observable = await interceptor.intercept(
      buildContext({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
      { handle: () => of("ok") },
    );
    await firstValueFrom(observable);

    expect(headers["X-Edutu-Ai-Remaining"]).toBe("4");
  });

  it("refunds the charge (counter included) when the handler fails", async () => {
    const refund = jest.fn(async () => undefined);
    const charge = {
      userId: "user-1",
      action: "chatMessage" as const,
      charged: 0,
      ledgerId: null,
      chatCounted: true,
      remaining: 4,
    };
    const interceptor = buildInterceptor({
      meter: jest.fn(async () => charge),
      refund,
    });

    const observable = await interceptor.intercept(buildContext({}), {
      handle: () => throwError(() => new Error("provider down")),
    });

    await expect(firstValueFrom(observable)).rejects.toThrow("provider down");
    expect(refund).toHaveBeenCalledWith(charge);
  });
});

describe("MonetizationController — voice metering and premium authorization", () => {
  it("forwards validated started-minute units to the meter", async () => {
    const meter = jest.fn(async () => ({
      userId: "user-1",
      action: "voicePerMinute" as const,
      charged: 10,
      ledgerId: "ledger-1",
      chatCounted: false,
      remaining: null,
    }));
    const controller = new MonetizationController({ meter } as any);

    await expect(
      controller.meter("user-1", { action: "voicePerMinute", units: 2 }),
    ).resolves.toMatchObject({ charged: 10 });
    expect(meter).toHaveBeenCalledWith("user-1", "voicePerMinute", 2);
  });

  it("rejects a voice authorization request with an unknown kind", async () => {
    const authorizeVoicePremium = jest.fn();
    const controller = new MonetizationController({
      authorizeVoicePremium,
    } as any);

    await expect(
      controller.authorizeVoice("user-1", { kind: "phone" as "tts" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authorizeVoicePremium).not.toHaveBeenCalled();
  });

  it("authorizes transcription as a premium voice capability", async () => {
    const authorizeVoicePremium = jest.fn(async () => undefined);
    const controller = new MonetizationController({
      authorizeVoicePremium,
    } as any);

    await expect(
      controller.authorizeVoice("user-1", { kind: "stt" }),
    ).resolves.toEqual({ ok: true, kind: "stt" });
    expect(authorizeVoicePremium).toHaveBeenCalledWith("user-1");
  });

  it("authorizes each supported premium voice kind for the authenticated user", async () => {
    const authorizeVoicePremium = jest.fn(async () => undefined);
    const controller = new MonetizationController({
      authorizeVoicePremium,
    } as any);

    await expect(
      controller.authorizeVoice("user-1", { kind: "realtime" }),
    ).resolves.toEqual({ ok: true, kind: "realtime" });
    expect(authorizeVoicePremium).toHaveBeenCalledWith("user-1");
  });
});
