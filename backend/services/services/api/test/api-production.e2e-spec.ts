import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { EdutuApiController } from "../src/edutu-api/edutu-api.controller";
import { EdutuApiKeyGuard } from "../src/edutu-api/edutu-api-key.guard";
import { EdutuApiService } from "../src/edutu-api/edutu-api.service";
import { EdutuApiUsageInterceptor } from "../src/edutu-api/edutu-api-usage.interceptor";
import type { ApiConsumerContext } from "../src/edutu-api/current-api-consumer.decorator";
import { EdutuApiUsageService } from "../src/edutu-api/edutu-api-usage.service";

const TEST_KEYS = {
  ownerA: "edu_test_owner_a_fixture",
  ownerB: "edu_test_owner_b_fixture",
};

type BillingMode = "success" | "exhausted" | "unavailable";

function consumer(
  id: string,
  ownerUserId: string,
  scopes: string[] = ["usage:read", "opportunities:read"],
): ApiConsumerContext {
  return {
    id,
    name: `${ownerUserId} fixture project`,
    plan: "starter",
    scopes,
    monthlyQuota: 100,
    ownerUserId,
    environment: "test",
    status: "active",
    rateLimitPerMinute: 60,
  };
}

function runNodeScript(
  script: string,
  environment: Record<string, string | undefined>,
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveResult) => {
      const child = spawn(process.execPath, [script], {
        env: {
          PATH: process.env.PATH,
          NODE_PATH: process.env.NODE_PATH,
          ...environment,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => resolveResult({ code, stdout, stderr }));
    },
  );
}

describe("production API contract (disposable fixture)", () => {
  let app: INestApplication;
  let apiGuard: EdutuApiKeyGuard;
  let usage: {
    reserveRateLimit: jest.Mock;
    reserveMonthlyQuota: jest.Mock;
    readCreditBalanceForConsumer: jest.Mock;
    reserveRequestCredit: jest.Mock;
    recordUsageEvent: jest.Mock;
  };
  let apiService: {
    listOpportunities: jest.Mock;
    getOpportunity: jest.Mock;
    getOpportunityStats: jest.Mock;
    syncOpportunities: jest.Mock;
    listCategories: jest.Mock;
    getUsage: jest.Mock;
    getRecommendations: jest.Mock;
    recordPartnerEvent: jest.Mock;
  };
  let billingMode: BillingMode;

  beforeEach(async () => {
    billingMode = "success";
    usage = {
      reserveRateLimit: jest.fn().mockReturnValue({
        allowed: true,
        limit: 60,
        remaining: 59,
        resetAt: "2026-08-13T00:01:00.000Z",
        retryAfterSeconds: 0,
      }),
      reserveMonthlyQuota: jest.fn().mockResolvedValue({
        allowed: true,
        limit: 100,
        remaining: 99,
        resetAt: "2026-09-01T00:00:00.000Z",
        used: 1,
      }),
      readCreditBalanceForConsumer: jest.fn().mockResolvedValue(0),
      reserveRequestCredit: jest.fn().mockImplementation(async () => {
        if (billingMode === "unavailable") {
          throw new Error("disposable billing outage");
        }
        if (billingMode === "exhausted") {
          return { balance: 0, exhausted: true };
        }
        return { balance: 9, exhausted: false };
      }),
      recordUsageEvent: jest.fn().mockResolvedValue(undefined),
    };

    apiService = {
      listOpportunities: jest.fn().mockResolvedValue({
        object: "list",
        data: [{ id: "public-opportunity-1", title: "Fixture scholarship" }],
        meta: {
          limit: 2,
          offset: 4,
          cursor: null,
          nextOffset: 6,
          nextCursor: "cursor-fixture-2",
          total: 7,
          hasMore: true,
          generatedAt: "2026-08-13T00:00:00.000Z",
          requestId: "req-fixture-1",
          quota: { limit: 100, remaining: 99, resetAt: null },
        },
      }),
      getOpportunity: jest.fn().mockResolvedValue({
        id: "public-opportunity-1",
        title: "Fixture scholarship",
      }),
      getOpportunityStats: jest.fn(),
      syncOpportunities: jest.fn(),
      listCategories: jest.fn(),
      getUsage: jest.fn().mockImplementation(async (currentConsumer) => ({
        object: "usage",
        consumer: {
          id: currentConsumer.id,
          name: currentConsumer.name,
          plan: currentConsumer.plan,
        },
        credits: { remaining: currentConsumer.creditBalance ?? 0 },
        quota: currentConsumer.quota,
        meta: { generatedAt: "2026-08-13T00:00:00.000Z" },
      })),
      getRecommendations: jest.fn(),
      recordPartnerEvent: jest.fn(),
    };

    apiGuard = new EdutuApiKeyGuard(
      new Reflector(),
      usage as unknown as EdutuApiUsageService,
    );
    const guardInternals = apiGuard as unknown as {
      resolveConsumer: jest.Mock;
    };
    jest
      .spyOn(guardInternals, "resolveConsumer")
      .mockImplementation(async (apiKey: string) => {
        if (apiKey === TEST_KEYS.ownerA) {
          return consumer("consumer-a", "user-a");
        }
        if (apiKey === TEST_KEYS.ownerB) {
          return consumer("consumer-b", "user-b", ["usage:read"]);
        }
        throw new UnauthorizedException("fixture key is not recognized");
      });

    const module = await Test.createTestingModule({
      controllers: [EdutuApiController],
      providers: [
        { provide: EdutuApiService, useValue: apiService },
        { provide: EdutuApiUsageService, useValue: usage },
        EdutuApiUsageInterceptor,
      ],
    })
      .overrideGuard(EdutuApiKeyGuard)
      .useValue(apiGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it("keeps health free, accepts bearer keys, and emits stable headers", async () => {
    await request(app.getHttpServer())
      .get("/v1/health")
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          object: "health",
          status: "ok",
          service: "edutu-api",
        });
        expect(response.headers["x-edutu-request-id"]).toBeTruthy();
      });

    await request(app.getHttpServer())
      .get("/v1/usage")
      .set("Authorization", `Bearer ${TEST_KEYS.ownerA}`)
      .set("x-request-id", "usage-fixture-1")
      .expect(200)
      .expect((response) => {
        expect(response.body.object).toBe("usage");
        expect(response.body.credits.remaining).toBe(0);
        expect(response.headers["x-edutu-request-id"]).toBe("usage-fixture-1");
        expect(response.headers["x-edutu-quota-limit"]).toBe("100");
        expect(usage.reserveRequestCredit).not.toHaveBeenCalled();
      });
  });

  it("enforces key ownership and scopes without leaking fixture secrets", async () => {
    await request(app.getHttpServer())
      .get("/v1/usage")
      .set("x-edutu-api-key", TEST_KEYS.ownerB)
      .expect(200)
      .expect((response) => {
        expect(response.body.consumer.id).toBe("consumer-b");
        expect(response.body.consumer.id).not.toBe("consumer-a");
      });

    await request(app.getHttpServer())
      .get("/v1/opportunities")
      .set("x-edutu-api-key", TEST_KEYS.ownerB)
      .expect(403)
      .expect((response) => {
        expect(response.body.error.code).toBe("scope_required");
        expect(JSON.stringify(response.body)).not.toContain(TEST_KEYS.ownerB);
      });

    await request(app.getHttpServer())
      .get("/v1/usage")
      .set("x-edutu-api-key", "invalid-fixture-key")
      .expect(401);
  });

  it("returns 402 at zero credits and 503 when billing verification is unavailable", async () => {
    billingMode = "exhausted";
    await request(app.getHttpServer())
      .get(
        "/v1/opportunities?limit=2&offset=4&category=Scholarship&cursor=cursor-fixture-1",
      )
      .set("x-edutu-api-key", TEST_KEYS.ownerA)
      .set("x-request-id", "credits-fixture-1")
      .expect(402)
      .expect((response) => {
        expect(response.body).toMatchObject({
          requestId: "credits-fixture-1",
        });
        expect(response.body.error.code).toBe("credits_exhausted");
      });

    billingMode = "unavailable";
    await request(app.getHttpServer())
      .get("/v1/opportunities")
      .set("x-edutu-api-key", TEST_KEYS.ownerA)
      .expect(503)
      .expect((response) => {
        expect(response.body.error.code).toBe("billing_unavailable");
        expect(JSON.stringify(response.body)).not.toContain(TEST_KEYS.ownerA);
      });
  });

  it("preserves paginated and filtered opportunity response fields after a paid request", async () => {
    await request(app.getHttpServer())
      .get(
        "/v1/opportunities?limit=2&offset=4&category=Scholarship&cursor=cursor-fixture-1&includeTotal=true",
      )
      .set("x-edutu-api-key", TEST_KEYS.ownerA)
      .expect(200)
      .expect((response) => {
        expect(apiService.listOpportunities).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 2,
            offset: 4,
            category: "Scholarship",
            cursor: "cursor-fixture-1",
            includeTotal: "true",
          }),
          expect.objectContaining({ ownerUserId: "user-a" }),
        );
        expect(response.body).toMatchObject({
          object: "list",
          data: expect.any(Array),
          meta: expect.objectContaining({
            limit: 2,
            offset: 4,
            nextOffset: 6,
            nextCursor: "cursor-fixture-2",
            hasMore: true,
          }),
        });
        expect(response.headers["x-edutu-credits-remaining"]).toBe("9");
      });
  });

  it("fails closed when smoke configuration is incomplete and redacts the API key", async () => {
    const script = resolve(__dirname, "../scripts/smoke-api-production.mjs");
    const missing = await runNodeScript(script, {
      API_BASE_URL: "http://127.0.0.1:9",
      EDUTU_API_KEY: undefined,
    });
    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toContain("EDUTU_API_KEY");

    const secret = "fixture-smoke-key-never-production";
    const server: Server = createServer((_request, response) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: secret }));
    });
    await new Promise<void>((resolveResult) =>
      server.listen(0, "127.0.0.1", resolveResult),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture server failed");

    try {
      const failed = await runNodeScript(script, {
        API_BASE_URL: `http://127.0.0.1:${address.port}`,
        EDUTU_API_KEY: secret,
      });
      expect(failed.code).not.toBe(0);
      expect(`${failed.stdout}${failed.stderr}`).not.toContain(secret);
      expect(failed.stderr).toContain("API production smoke failed");
    } finally {
      await promisify(server.close.bind(server))();
    }

    const healthyServer: Server = createServer((request, response) => {
      const body = request.url?.startsWith("/v1/health")
        ? { status: "ok" }
        : request.url?.startsWith("/v1/usage")
          ? { object: "usage" }
          : request.url?.includes("smoke-opportunity")
            ? { id: "smoke-opportunity" }
            : { object: "list", data: [] };
      response.writeHead(200, {
        "content-type": "application/json",
        "x-edutu-request-id": "smoke-fixture-1",
      });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolveResult) =>
      healthyServer.listen(0, "127.0.0.1", resolveResult),
    );
    const healthyAddress = healthyServer.address();
    if (!healthyAddress || typeof healthyAddress === "string") {
      throw new Error("healthy fixture server failed");
    }
    try {
      const healthy = await runNodeScript(script, {
        API_BASE_URL: `http://127.0.0.1:${healthyAddress.port}`,
        EDUTU_API_KEY: secret,
        EXPECTED_OPPORTUNITY_ID: "smoke-opportunity",
      });
      expect(healthy.code).toBe(0);
      expect(healthy.stdout).toContain('"status":"ok"');
      expect(`${healthy.stdout}${healthy.stderr}`).not.toContain(secret);
    } finally {
      await promisify(healthyServer.close.bind(healthyServer))();
    }
  });
});
