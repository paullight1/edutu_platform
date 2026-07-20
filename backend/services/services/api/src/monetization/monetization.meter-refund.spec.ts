import { BadRequestException, HttpStatus, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MonetizationController } from "./monetization.controller";
import { MonetizationService } from "./monetization.service";
import { DEFAULT_ADMIN_SETTINGS } from "../settings/settings.dto";
import type { SettingsService } from "../settings/settings.service";

// Same db stub shape as the other monetization specs: real control flow, no
// connection, every rendered SQL string recorded so the ownership lookup, the
// idempotent refund insert and the profile credit can be told apart.
jest.mock("../db", () => {
  const executed: string[] = [];
  (globalThis as Record<string, any>).__refundSql = executed;
  const handlers: Record<string, any> = {};
  (globalThis as Record<string, any>).__refundHandlers = handlers;

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
  (globalThis as Record<string, any>).__refundSql;
const handlers = (): Record<string, any> =>
  (globalThis as Record<string, any>).__refundHandlers;

function buildService(): MonetizationService {
  return new MonetizationService({
    getSettings: async () => ({ settings: DEFAULT_ADMIN_SETTINGS }),
  } as unknown as SettingsService);
}

const creditBacks = () =>
  executedSql().filter(
    (text) =>
      text.includes("update profiles") && text.includes("credits = credits +"),
  );

/**
 * Ledger fixture: one owned `ai_action` spend row, refundable exactly once.
 * `owned: false` models both "no such charge" and "belongs to another user" —
 * the ownership predicate is in the SQL, so both cases return zero rows.
 */
function ledgerFixture(options: { owned: boolean; amount?: number }) {
  const state = { refunded: false };
  handlers().execute = (text: string) => {
    if (text.includes("from credit_transactions")) {
      return options.owned
        ? { rows: [{ amount: -(options.amount ?? 5) }] }
        : { rows: [] };
    }
    if (text.includes("insert into credit_transactions")) {
      // Stands in for credit_transactions_ai_action_idem: the second insert of
      // `${ledgerId}:refund` conflicts and returns no row.
      if (state.refunded) return { rows: [] };
      state.refunded = true;
      return { rows: [{ id: "tx-1" }] };
    }
    return { rows: [] };
  };
  return state;
}

describe("MonetizationService.refundMeterCharge", () => {
  const ledgerId = randomUUID();

  beforeEach(() => {
    executedSql().length = 0;
    delete handlers().execute;
    delete handlers().transaction;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("refunds a caller's own charge exactly once, then no-ops", async () => {
    const service = buildService();
    ledgerFixture({ owned: true, amount: 5 });

    await expect(
      service.refundMeterCharge("user-1", ledgerId),
    ).resolves.toEqual({ refunded: true, credits: 5 });
    expect(creditBacks()).toHaveLength(1);

    // Idempotent replay: no error (an error would invite a retry storm) and no
    // second credit.
    await expect(
      service.refundMeterCharge("user-1", ledgerId),
    ).resolves.toEqual({ refunded: false, credits: 0 });
    expect(creditBacks()).toHaveLength(1);
  });

  it("scopes the lookup to an ai_action row owned by the caller", async () => {
    const service = buildService();
    ledgerFixture({ owned: true });
    await service.refundMeterCharge("user-1", ledgerId);

    const lookup = executedSql().find((text) =>
      text.includes("from credit_transactions"),
    );
    expect(lookup).toContain("related_type = 'ai_action'");
    // Ownership is enforced in SQL (dual-keyed like every other profile read),
    // which is what makes a guessed uuid worthless.
    expect(lookup).toContain("clerk_id_to_uuid");
  });

  it("rejects another user's ledgerId without crediting anyone", async () => {
    const service = buildService();
    ledgerFixture({ owned: false });

    await expect(
      service.refundMeterCharge("user-2", ledgerId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(creditBacks()).toHaveLength(0);
  });

  it("is a no-op for a free-tier charge that debited nothing", async () => {
    const service = buildService();
    ledgerFixture({ owned: true, amount: 0 });

    await expect(
      service.refundMeterCharge("user-1", ledgerId),
    ).resolves.toEqual({ refunded: false, credits: 0 });
    expect(creditBacks()).toHaveLength(0);
  });

  it("fails closed (503) when the ledger write is unavailable", async () => {
    const service = buildService();
    ledgerFixture({ owned: true });
    handlers().transaction = async () => {
      throw new Error("connection terminated unexpectedly");
    };

    await expect(
      service.refundMeterCharge("user-1", ledgerId),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});

describe("MonetizationController — meter + meter/refund", () => {
  const buildController = (monetization: Partial<MonetizationService>) =>
    new MonetizationController(monetization as MonetizationService);

  it("returns the ledgerId alongside the unchanged charged/remaining fields", async () => {
    const headers: Record<string, string> = {};
    const controller = buildController({
      meter: jest.fn(async () => ({
        userId: "user-1",
        action: "voicePerMinute" as const,
        charged: 5,
        ledgerId: "ledger-1",
        chatCounted: false,
        remaining: null,
      })),
    });

    const result = await controller.meter(
      "user-1",
      { action: "voicePerMinute" },
      {
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as any,
    );

    expect(result).toEqual({
      ok: true,
      charged: 5,
      remaining: null,
      ledgerId: "ledger-1",
    });
  });

  it("rejects a non-uuid handle before touching the ledger", async () => {
    const refundMeterCharge = jest.fn();
    const controller = buildController({ refundMeterCharge });

    await expect(
      controller.refundMeter("user-1", { ledgerId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refundMeterCharge).not.toHaveBeenCalled();
  });

  it("passes a well-formed handle through to the owner-checked refund", async () => {
    const ledgerId = randomUUID();
    const refundMeterCharge = jest.fn(async () => ({
      refunded: true,
      credits: 5,
    }));
    const controller = buildController({ refundMeterCharge });

    await expect(
      controller.refundMeter("user-1", { ledgerId }),
    ).resolves.toEqual({ ok: true, refunded: true, credits: 5 });
    expect(refundMeterCharge).toHaveBeenCalledWith("user-1", ledgerId);
  });
});
