import {
  OpportunityPipelineAnalyticsService,
  summarizeOpportunityPipelineEvents,
  type OpportunityPipelineEventRow,
} from "./opportunity-pipeline-analytics.service";

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-09-30T23:59:59Z");

function event(
  eventType: string,
  overrides: Partial<OpportunityPipelineEventRow> = {},
): OpportunityPipelineEventRow {
  return {
    userId: "user-1",
    journeyId: "journey-1",
    opportunityId: "opportunity-1",
    eventType,
    source: "web",
    metadata: {},
    createdAt: new Date("2026-09-03T10:00:00Z"),
    ...overrides,
  };
}

describe("opportunity pipeline analytics", () => {
  it("counts distinct users instead of retry events", () => {
    const summary = summarizeOpportunityPipelineEvents(
      [
        event("application_opened"),
        event("application_opened", {
          createdAt: new Date("2026-09-03T10:01:00Z"),
        }),
        event("application_opened", {
          userId: "user-2",
          journeyId: "journey-2",
        }),
      ],
      FROM,
      TO,
    );

    expect(summary.guardrails.applicationOpenedUsers).toBe(2);
    expect(
      summary.funnel.find((item) => item.step === "application_opened"),
    ).toMatchObject({ users: 2, events: 3 });
  });

  it("keeps application opened separate from application confirmed", () => {
    const summary = summarizeOpportunityPipelineEvents(
      [event("application_opened"), event("application_confirmed")],
      FROM,
      TO,
    );

    expect(summary.guardrails).toMatchObject({
      applicationOpenedUsers: 1,
      applicationConfirmedUsers: 1,
      openedWithoutConfirmationGap: 0,
    });
    expect(
      summary.funnel.find((item) => item.step === "application_confirmed"),
    ).toMatchObject({ users: 1 });
  });

  it("calculates the north star only when first task completes within seven days", () => {
    const summary = summarizeOpportunityPipelineEvents(
      [
        event("journey_activated", {
          userId: "user-1",
          journeyId: "journey-1",
          createdAt: new Date("2026-09-01T00:00:00Z"),
        }),
        event("task_completed", {
          userId: "user-1",
          journeyId: "journey-1",
          createdAt: new Date("2026-09-05T00:00:00Z"),
        }),
        event("journey_activated", {
          userId: "user-2",
          journeyId: "journey-2",
          createdAt: new Date("2026-09-01T00:00:00Z"),
        }),
        event("task_completed", {
          userId: "user-2",
          journeyId: "journey-2",
          createdAt: new Date("2026-09-10T00:00:00Z"),
        }),
      ],
      FROM,
      TO,
    );

    expect(summary.northStar).toEqual({
      eligibleUsers: 2,
      successfulUsers: 1,
      percentage: 50,
    });
  });

  it("records offers only from an offer outcome", () => {
    const summary = summarizeOpportunityPipelineEvents(
      [
        event("journey_outcome", { metadata: { outcome: "rejected" } }),
        event("journey_outcome", {
          userId: "user-2",
          journeyId: "journey-2",
          metadata: { outcome: "offer" },
        }),
      ],
      FROM,
      TO,
    );

    expect(
      summary.funnel.find((item) => item.step === "offer_recorded"),
    ).toMatchObject({ users: 1, events: 1 });
  });

  it("reads only the requested range through the source", async () => {
    const source = { listEvents: jest.fn().mockResolvedValue([]) };
    const service = new OpportunityPipelineAnalyticsService(source);

    await service.getSummary({ from: FROM, to: TO });
    expect(source.listEvents).toHaveBeenCalledWith({ from: FROM, to: TO });
  });
});
