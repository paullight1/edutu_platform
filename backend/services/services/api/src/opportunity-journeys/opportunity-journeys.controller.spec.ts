import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { OpportunityJourneyDomainError } from "./opportunity-journey.errors";
import { OpportunityJourneysController } from "./opportunity-journeys.controller";

const USER_ID = "user_controller";

describe("OpportunityJourneysController", () => {
  function createController() {
    const homeService = {
      getHome: jest.fn().mockResolvedValue({ recommendations: [] }),
    };
    const intentService = {
      getCurrentIntent: jest.fn().mockResolvedValue({ source: "inferred" }),
      saveExplicitIntent: jest.fn().mockResolvedValue({ source: "explicit" }),
    };
    const journeysService = {
      listJourneys: jest.fn().mockResolvedValue([]),
      createJourney: jest.fn().mockResolvedValue({ journey: { id: "journey" } }),
      getJourney: jest.fn().mockResolvedValue({ journey: { id: "journey" } }),
      transitionJourney: jest.fn().mockResolvedValue({ journey: {} }),
      setPriority: jest.fn().mockResolvedValue({ journey: {} }),
      updateTask: jest.fn().mockResolvedValue({ journey: {} }),
      markApplicationOpened: jest.fn().mockResolvedValue({ journey: {} }),
      confirmApplication: jest.fn().mockResolvedValue({ journey: {} }),
      recordOutcome: jest.fn().mockResolvedValue({ journey: {} }),
    };

    return {
      controller: new OpportunityJourneysController(
        homeService as never,
        intentService as never,
        journeysService as never,
      ),
      homeService,
      intentService,
      journeysService,
    };
  }

  it("serves the aggregate home with a bounded recommendation limit", async () => {
    const { controller, homeService } = createController();
    await controller.getOpportunityHome(USER_ID, { recommendationLimit: 5 });
    expect(homeService.getHome).toHaveBeenCalledWith(USER_ID, 5);
  });

  it("reads and replaces the current intent", async () => {
    const { controller, intentService } = createController();
    await controller.getOpportunityIntent(USER_ID);
    await controller.putOpportunityIntent(
      USER_ID,
      {
        goalKey: "employment",
        opportunityTypes: ["job"],
        locations: ["Nigeria"],
        remotePreference: "preferred",
        actionHorizonDays: 90,
        weeklyHours: 5,
        readinessMode: "apply_now",
      },
      "intent-key",
    );

    expect(intentService.getCurrentIntent).toHaveBeenCalledWith(USER_ID);
    expect(intentService.saveExplicitIntent).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ goalKey: "employment" }),
      "intent-key",
    );
  });

  it("delegates the complete journey lifecycle without conflating open and submitted", async () => {
    const { controller, journeysService } = createController();
    await controller.createOpportunityJourney(USER_ID, {
      opportunityId: "11111111-1111-4111-8111-111111111111",
      action: "pursue",
      idempotencyKey: "pursue-1",
    });
    await controller.openApplication(USER_ID, "journey-1", {
      expectedVersion: 2,
      idempotencyKey: "opened-1",
    });
    await controller.confirmApplication(USER_ID, "journey-1", {
      expectedVersion: 3,
      idempotencyKey: "confirmed-1",
    });

    expect(journeysService.markApplicationOpened).toHaveBeenCalledTimes(1);
    expect(journeysService.confirmApplication).toHaveBeenCalledTimes(1);
    expect(journeysService.markApplicationOpened).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ state: "applied" }),
    );
  });

  it("maps limit and version conflicts to HTTP 409", async () => {
    const { controller, journeysService } = createController();
    journeysService.createJourney.mockRejectedValueOnce(
      new OpportunityJourneyDomainError(
        "ACTIVE_PURSUIT_LIMIT_REACHED",
        "limit reached",
      ),
    );
    await expect(
      controller.createOpportunityJourney(USER_ID, {
        opportunityId: "11111111-1111-4111-8111-111111111111",
        action: "pursue",
        idempotencyKey: "limit",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps invalid transitions to HTTP 422 and missing journeys to 404", async () => {
    const { controller, journeysService } = createController();
    journeysService.transitionJourney.mockRejectedValueOnce(
      new OpportunityJourneyDomainError(
        "INVALID_JOURNEY_TRANSITION",
        "invalid transition",
      ),
    );
    await expect(
      controller.transitionJourney(USER_ID, "journey-1", {
        state: "applied",
        expectedVersion: 1,
        idempotencyKey: "invalid",
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    journeysService.getJourney.mockRejectedValueOnce(
      new OpportunityJourneyDomainError("JOURNEY_NOT_FOUND", "missing"),
    );
    await expect(
      controller.getOpportunityJourney(USER_ID, "journey-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
