import { Controller, Get, UseGuards } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ApiScope } from "./api-scope.decorator";
import { EdutuApiBilling } from "./edutu-api-billing-policy";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";
import { EdutuApiExceptionFilter } from "./edutu-api-exception.filter";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import { EdutuApiUsageService } from "./edutu-api-usage.service";

let paidHandler: jest.Mock;

@Controller("v1")
@UseGuards(EdutuApiKeyGuard)
class PaidPipelineController {
  @Get("opportunities")
  @ApiScope("opportunities:read")
  @EdutuApiBilling("credit")
  execute() {
    paidHandler();
    return { object: "paid.result" };
  }
}

describe("Edutu API metering request pipeline", () => {
  let app: INestApplication;
  let usageService: {
    reserveMonthlyQuota: jest.Mock;
    reserveRateLimit: jest.Mock;
    reserveRequestCredit: jest.Mock;
    readCreditBalanceForConsumer: jest.Mock;
  };

  const consumer: ApiConsumerContext = {
    id: "consumer-pipeline",
    name: "Pipeline consumer",
    plan: "starter",
    scopes: ["opportunities:read"],
    monthlyQuota: null,
    ownerUserId: "owner-pipeline",
  };

  beforeEach(async () => {
    paidHandler = jest.fn();
    usageService = {
      reserveMonthlyQuota: jest.fn().mockResolvedValue({
        allowed: true,
        limit: null,
        remaining: null,
        resetAt: null,
        used: null,
      }),
      reserveRateLimit: jest.fn().mockReturnValue({
        allowed: true,
        limit: 60,
        remaining: 59,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        retryAfterSeconds: 0,
      }),
      reserveRequestCredit: jest.fn(),
      readCreditBalanceForConsumer: jest.fn().mockResolvedValue(0),
    };

    jest
      .spyOn(EdutuApiKeyGuard.prototype as any, "resolveConsumer")
      .mockResolvedValue(consumer);

    const moduleRef = await Test.createTestingModule({
      controllers: [PaidPipelineController],
      providers: [
        EdutuApiKeyGuard,
        {
          provide: EdutuApiUsageService,
          useValue: usageService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new EdutuApiExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it("returns stable 402 and does not invoke a paid handler at zero balance", async () => {
    usageService.reserveRequestCredit.mockResolvedValue({
      balance: 0,
      exhausted: true,
    });

    const response = await request(app.getHttpServer())
      .get("/v1/opportunities")
      .set("x-edutu-api-key", "edutu_live_pipeline")
      .set("x-request-id", "pipeline-zero-1");

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: { status: 402, code: "credits_exhausted" },
      requestId: "pipeline-zero-1",
    });
    expect(paidHandler).not.toHaveBeenCalled();
  });

  it("returns stable 503 and does not invoke a paid handler when reservation fails", async () => {
    usageService.reserveRequestCredit.mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await request(app.getHttpServer())
      .get("/v1/opportunities")
      .set("x-edutu-api-key", "edutu_live_pipeline")
      .set("x-request-id", "pipeline-failure-1");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: { status: 503, code: "billing_unavailable" },
      requestId: "pipeline-failure-1",
    });
    expect(paidHandler).not.toHaveBeenCalled();
  });
});
