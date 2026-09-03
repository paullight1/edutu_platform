import {
  type CanActivate,
  type ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { OpportunityHomeService } from "../src/opportunity-journeys/opportunity-home.service";
import { OpportunityIntentService } from "../src/opportunity-journeys/opportunity-intent.service";
import { OpportunityJourneysController } from "../src/opportunity-journeys/opportunity-journeys.controller";
import { OpportunityJourneysService } from "../src/opportunity-journeys/opportunity-journeys.service";

class DisposableUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string };
    }>();
    const raw = request.headers["x-test-user"];
    const userId = Array.isArray(raw) ? raw[0] : raw;
    if (!userId) throw new UnauthorizedException("test user is required");
    request.user = { id: userId };
    return true;
  }
}

describe("opportunity journey HTTP contract", () => {
  let app: INestApplication;
  const homeService = {
    getHome: jest.fn().mockResolvedValue({
      intent: { goalKey: "study_funding", source: "inferred" },
      activePursuits: [],
      recommendations: [],
    }),
  };
  const intentService = {
    getCurrentIntent: jest
      .fn()
      .mockResolvedValue({ goalKey: "study_funding", source: "inferred" }),
    saveExplicitIntent: jest
      .fn()
      .mockResolvedValue({ goalKey: "employment", source: "explicit" }),
  };
  const journeysService = {
    listJourneys: jest.fn().mockResolvedValue([]),
    createJourney: jest.fn().mockResolvedValue({
      journey: { id: "11111111-1111-4111-8111-111111111111" },
    }),
    getJourney: jest.fn().mockResolvedValue({
      journey: { id: "11111111-1111-4111-8111-111111111111" },
    }),
    transitionJourney: jest.fn().mockResolvedValue({ journey: {} }),
    setPriority: jest.fn().mockResolvedValue({ journey: {} }),
    updateTask: jest.fn().mockResolvedValue({ journey: {} }),
    markApplicationOpened: jest.fn().mockResolvedValue({
      journey: {
        id: "11111111-1111-4111-8111-111111111111",
        state: "application_opened",
        appliedAt: null,
      },
    }),
    confirmApplication: jest.fn().mockResolvedValue({
      journey: {
        id: "11111111-1111-4111-8111-111111111111",
        state: "applied",
        appliedAt: "2026-09-03T00:00:00.000Z",
      },
    }),
    recordOutcome: jest.fn().mockResolvedValue({ journey: {} }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OpportunityJourneysController],
      providers: [
        { provide: OpportunityHomeService, useValue: homeService },
        { provide: OpportunityIntentService, useValue: intentService },
        { provide: OpportunityJourneysService, useValue: journeysService },
        { provide: APP_GUARD, useClass: DisposableUserGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires an authenticated user on the aggregate home", async () => {
    await request(app.getHttpServer()).get("/me/opportunity-home").expect(401);
  });

  it("serves the focused home for the authenticated user", async () => {
    await request(app.getHttpServer())
      .get("/me/opportunity-home?recommendationLimit=3")
      .set("x-test-user", "user_e2e")
      .expect(200)
      .expect(({ body }) => {
        expect(body.intent.goalKey).toBe("study_funding");
      });

    expect(homeService.getHome).toHaveBeenCalledWith("user_e2e", 3);
  });

  it("validates journey creation before invoking the service", async () => {
    await request(app.getHttpServer())
      .post("/me/opportunity-journeys")
      .set("x-test-user", "user_e2e")
      .send({ action: "pursue", idempotencyKey: "missing-opportunity" })
      .expect(400);

    expect(journeysService.createJourney).not.toHaveBeenCalled();
  });

  it("keeps application opening separate from confirmed submission", async () => {
    const journeyId = "11111111-1111-4111-8111-111111111111";

    await request(app.getHttpServer())
      .post(`/me/opportunity-journeys/${journeyId}/application-opened`)
      .set("x-test-user", "user_e2e")
      .send({ expectedVersion: 2, idempotencyKey: "opened-e2e" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.journey.state).toBe("application_opened");
        expect(body.journey.appliedAt).toBeNull();
      });

    expect(journeysService.markApplicationOpened).toHaveBeenCalledTimes(1);
    expect(journeysService.confirmApplication).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/me/opportunity-journeys/${journeyId}/application-confirmed`)
      .set("x-test-user", "user_e2e")
      .send({ expectedVersion: 3, idempotencyKey: "confirmed-e2e" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.journey.state).toBe("applied");
        expect(body.journey.appliedAt).toBeTruthy();
      });

    expect(journeysService.confirmApplication).toHaveBeenCalledTimes(1);
  });
});
