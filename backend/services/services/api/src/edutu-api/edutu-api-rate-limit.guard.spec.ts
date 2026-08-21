import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import type { EdutuApiRateLimitService } from "./edutu-api-rate-limit.service";
import type { EdutuApiUsageService } from "./edutu-api-usage.service";

const LIVE_API_KEY =
  "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function context() {
  const request: Record<string, any> = {
    headers: { authorization: `Bearer ${LIVE_API_KEY}` },
    method: "GET",
    originalUrl: "/v1/opportunities",
  };
  const response = { setHeader: jest.fn() };
  return {
    request,
    response,
    executionContext: {
      getHandler: () => function handler() {},
      getClass: () => function clazz() {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
  };
}

function dependencies() {
  const usage: Pick<
    EdutuApiUsageService,
    | "reserveMonthlyQuota"
    | "reserveRequestCredit"
    | "reserveRateLimit"
    | "readCreditBalanceForConsumer"
  > = {
    reserveMonthlyQuota: jest.fn().mockResolvedValue({
      allowed: true,
      limit: 1000,
      remaining: 999,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
      used: 1,
    }),
    reserveRequestCredit: jest
      .fn()
      .mockResolvedValue({ balance: 9, exhausted: false }),
    reserveRateLimit: jest.fn(() => {
      throw new Error("legacy process-local limiter must not be used");
    }),
    readCreditBalanceForConsumer: jest.fn().mockResolvedValue(9),
  };
  const rateLimit: Pick<EdutuApiRateLimitService, "reserve"> = {
    reserve: jest.fn().mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
      retryAfterSeconds: 0,
    }),
  };
  return { usage, rateLimit };
}

describe("EdutuApiKeyGuard distributed rate limiting", () => {
  it("uses the database-authoritative limiter instead of process-local usage state", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const { usage, rateLimit } = dependencies();
    const guard = new EdutuApiKeyGuard(
      reflector,
      usage as EdutuApiUsageService,
      rateLimit as EdutuApiRateLimitService,
    );
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Test consumer",
      plan: "starter",
      scopes: ["*"],
      monthlyQuota: 1000,
      rateLimitPerMinute: 60,
      ownerUserId: "user-1",
    });
    const { executionContext, response } = context();

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(rateLimit.reserve).toHaveBeenCalledTimes(1);
    expect(usage.reserveRateLimit).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "60");
  });

  it("maps shared limiter uncertainty to a stable 503", async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const { usage, rateLimit } = dependencies();
    (rateLimit.reserve as jest.Mock).mockRejectedValue(
      new Error("API rate limit unavailable"),
    );
    const guard = new EdutuApiKeyGuard(
      reflector,
      usage as EdutuApiUsageService,
      rateLimit as EdutuApiRateLimitService,
    );
    jest.spyOn(guard as any, "resolveConsumer").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Test consumer",
      plan: "starter",
      scopes: ["*"],
      monthlyQuota: 1000,
      rateLimitPerMinute: 60,
      ownerUserId: "user-1",
    });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: "rate_limit_unavailable",
        requestId: expect.any(String),
      }),
    });
  });
});
