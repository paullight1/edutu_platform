import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { db } from "../db";
import { hashApiKey, legacyHashApiKey } from "../common/api-key-hash";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import type { EdutuApiUsageService } from "./edutu-api-usage.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  update: jest.Mock;
};

const TEST_API_KEY =
  "edu_test_8b2c4f6e_9a1d4c7f8e0b2a5c6d9f1a3b4c5d6e7f8a9b0c1d";
const LIVE_API_KEY =
  "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createContext(headers: Record<string, string | undefined>) {
  const request: Record<string, unknown> = { headers };
  const response = { setHeader: jest.fn() };

  return {
    request,
    response,
    context: {
      getHandler: () => function handler() {},
      getClass: () => function clazz() {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
  };
}

describe("EdutuApiKeyGuard", () => {
  const originalApiKeys = process.env.EDUTU_API_KEYS;
  const originalPepper = process.env.API_KEY_PEPPER;
  const originalLegacyCompatibility = process.env.API_KEY_ALLOW_LEGACY_HASHES;
  let usageService: Pick<
    EdutuApiUsageService,
    | "reserveMonthlyQuota"
    | "reserveRequestCredit"
    | "reserveRateLimit"
    | "readCreditBalanceForConsumer"
  >;

  beforeEach(() => {
    usageService = {
      reserveMonthlyQuota: jest.fn().mockResolvedValue({
        allowed: true,
        limit: null,
        remaining: null,
        resetAt: null,
        used: null,
      }),
      reserveRequestCredit: jest
        .fn()
        .mockResolvedValue({ balance: 10, exhausted: false }),
      reserveRateLimit: jest.fn().mockReturnValue({
        allowed: true,
        limit: 60,
        remaining: 59,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        retryAfterSeconds: 0,
      }),
      readCreditBalanceForConsumer: jest.fn().mockResolvedValue(10),
    };
  });

  afterEach(() => {
    process.env.EDUTU_API_KEYS = originalApiKeys;
    if (originalPepper === undefined) delete process.env.API_KEY_PEPPER;
    else process.env.API_KEY_PEPPER = originalPepper;
    if (originalLegacyCompatibility === undefined) {
      delete process.env.API_KEY_ALLOW_LEGACY_HASHES;
    } else {
      process.env.API_KEY_ALLOW_LEGACY_HASHES = originalLegacyCompatibility;
    }
    jest.restoreAllMocks();
  });

  it("rejects requests without an Edutu API key", async () => {
    const reflector = new Reflector();
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({
        code: "missing_api_key",
        requestId: expect.any(String),
      }),
    });
  });

  it("rejects malformed generated keys before querying the database", async () => {
    const reflector = new Reflector();
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context } = createContext({
      "x-edutu-api-key": "edu_live_bad_prefix_unbounded-secret",
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "invalid_api_key" }),
    });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it("accepts only the rotated key and rejects the old key immediately", async () => {
    const oldKey = "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const newKey = "edu_live_a1b2c3d4_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([
              {
                id: "consumer-1",
                name: "Rotated",
                plan: "starter",
                allowedScopes: ["*"],
                monthlyQuota: null,
                apiKeyHash: hashApiKey(newKey),
                status: "active",
                ownerUserId: "user-1",
              },
            ]),
          }),
        }),
      }),
    });
    mockedDb.select.mockImplementation(select);
    mockedDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest
          .fn()
          .mockReturnValue({ execute: jest.fn().mockResolvedValue([]) }),
      }),
    });
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);

    const oldContext = createContext({ "x-edutu-api-key": oldKey });
    await expect(guard.canActivate(oldContext.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const newContext = createContext({ "x-edutu-api-key": newKey });
    newContext.request.originalUrl = "/v1/health";
    newContext.request.method = "GET";
    await expect(guard.canActivate(newContext.context)).resolves.toBe(true);
  });

  it("accepts a configured environment API key", async () => {
    process.env.EDUTU_API_KEYS = TEST_API_KEY;
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context, request, response } = createContext({
      "x-edutu-api-key": TEST_API_KEY,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.apiConsumer).toMatchObject({
      id: "env",
      plan: "internal",
      scopes: ["*"],
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Edutu-Quota-Limit",
      "unlimited",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Edutu-Credits-Remaining",
      "10",
    );
  });

  it("accepts a peppered environment sha256 key only with legacy compatibility enabled", async () => {
    process.env.API_KEY_PEPPER = "production-pepper-for-task-3";
    process.env.EDUTU_API_KEYS = `sha256:${legacyHashApiKey(TEST_API_KEY)}`;
    delete process.env.API_KEY_ALLOW_LEGACY_HASHES;
    mockedDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const disabledContext = createContext({
      "x-edutu-api-key": TEST_API_KEY,
    });

    await expect(
      guard.canActivate(disabledContext.context),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "invalid_api_key" }),
    });

    process.env.API_KEY_ALLOW_LEGACY_HASHES = "true";
    const enabledContext = createContext({
      "x-edutu-api-key": TEST_API_KEY,
    });
    await expect(guard.canActivate(enabledContext.context)).resolves.toBe(true);
  });

  it("accepts the standard x-api-key header as an alias", async () => {
    process.env.EDUTU_API_KEYS = TEST_API_KEY;
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context } = createContext({
      "x-api-key": TEST_API_KEY,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows routes marked public without requiring an API key", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
      if (key === "edutuApiPublic") return true;
      return undefined;
    });
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context, request, response } = createContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.edutuRequestId).toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Edutu-Request-Id",
      expect.any(String),
    );
    expect(usageService.reserveMonthlyQuota).not.toHaveBeenCalled();
    expect(usageService.reserveRequestCredit).not.toHaveBeenCalled();
  });

  it("rejects scoped requests when the key does not include the scope", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
      if (key === "edutuApiScope") return "admin:write";
      return undefined;
    });
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "consumer-1",
      name: "Test consumer",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: null,
    });
    const { context } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: "scope_required",
        requestId: expect.any(String),
      }),
    });
  });

  it("returns 402 with a stable code when credits are exhausted", async () => {
    (usageService.reserveRequestCredit as jest.Mock).mockResolvedValue({
      balance: 0,
      exhausted: true,
    });
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "consumer-1",
      name: "Test consumer",
      plan: "starter",
      scopes: ["*"],
      monthlyQuota: null,
      ownerUserId: "user-1",
    });
    const { context } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 402,
      response: expect.objectContaining({ code: "credits_exhausted" }),
    });
  });

  it("does not reserve a credit for the free categories endpoint", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
      if (key === "edutuApiScope") return "opportunities:read";
      return undefined;
    });
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "consumer-1",
      name: "Test consumer",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: null,
      ownerUserId: "user-1",
    });
    const { context, request } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });
    request.method = "GET";
    request.originalUrl = "/v1/categories";

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usageService.reserveRequestCredit).not.toHaveBeenCalled();
  });

  it("maps credit reservation uncertainty to a stable 503", async () => {
    (usageService.reserveRequestCredit as jest.Mock).mockRejectedValue({
      code: "billing_unavailable",
    });
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "consumer-1",
      name: "Test consumer",
      plan: "starter",
      scopes: ["*"],
      monthlyQuota: null,
      ownerUserId: "user-1",
    });
    const { context, request } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });
    request.method = "GET";
    request.originalUrl = "/v1/opportunities";

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "billing_unavailable" }),
    });
  });

  it("fails closed when a database consumer has an unknown balance", async () => {
    (usageService.reserveRequestCredit as jest.Mock).mockResolvedValue({
      balance: null,
      exhausted: false,
    });
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "consumer-1",
      name: "Test consumer",
      plan: "starter",
      scopes: ["*"],
      monthlyQuota: null,
      ownerUserId: "user-1",
    });
    const { context, request } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });
    request.method = "GET";
    request.originalUrl = "/v1/opportunities";

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: "billing_unavailable" }),
    });
  });

  it("enforces key, scope, rate, quota, credit in order", async () => {
    const order: string[] = [];
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
      if (key === "edutuApiScope") return "opportunities:read";
      return undefined;
    });
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    jest.spyOn(guard as any, "resolveConsumer").mockImplementation(async () => {
      order.push("key");
      return {
        id: "consumer-1",
        name: "Test consumer",
        plan: "starter",
        scopes: ["opportunities:read"],
        monthlyQuota: 1000,
        ownerUserId: "user-1",
      };
    });
    (usageService.reserveRateLimit as jest.Mock).mockImplementation(() => {
      order.push("rate");
      return {
        allowed: true,
        limit: 60,
        remaining: 59,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        retryAfterSeconds: 0,
      };
    });
    (usageService.reserveMonthlyQuota as jest.Mock).mockImplementation(
      async () => {
        order.push("quota");
        return {
          allowed: true,
          limit: 1000,
          remaining: 999,
          resetAt: new Date(Date.now() + 60_000).toISOString(),
          used: 1,
        };
      },
    );
    (usageService.reserveRequestCredit as jest.Mock).mockImplementation(
      async () => {
        order.push("credit");
        return { balance: 9, exhausted: false };
      },
    );
    const { context, request } = createContext({
      authorization: `Bearer ${LIVE_API_KEY}`,
    });
    request.method = "GET";
    request.originalUrl = "/v1/opportunities";

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(order).toEqual(["key", "rate", "quota", "credit"]);
  });
});
