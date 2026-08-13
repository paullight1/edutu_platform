import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import type { EdutuApiUsageService } from "./edutu-api-usage.service";

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
    jest.restoreAllMocks();
  });

  it("rejects requests without an Edutu API key", async () => {
    const reflector = new Reflector();
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      "Missing Edutu API key",
    );
  });

  it("accepts a configured environment API key", async () => {
    process.env.EDUTU_API_KEYS = "edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b";
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context, request, response } = createContext({
      "x-edutu-api-key": "edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b",
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

  it("accepts the standard x-api-key header as an alias", async () => {
    process.env.EDUTU_API_KEYS = "edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b";
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new EdutuApiKeyGuard(reflector, usageService as any);
    const { context } = createContext({
      "x-api-key": "edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b",
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
      authorization: "Bearer edutu_live_test",
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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
      authorization: "Bearer edutu_live_test",
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
      authorization: "Bearer edutu_live_test",
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
      authorization: "Bearer edutu_live_test",
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
      authorization: "Bearer edutu_live_test",
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
      authorization: "Bearer edutu_live_test",
    });
    request.method = "GET";
    request.originalUrl = "/v1/opportunities";

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(order).toEqual(["key", "rate", "quota", "credit"]);
  });
});
