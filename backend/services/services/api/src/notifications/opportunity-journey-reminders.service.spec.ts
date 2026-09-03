import {
  OpportunityJourneyRemindersService,
  nextOpportunityReminderDeliveryAt,
  selectOpportunityJourneyReminder,
  type OpportunityJourneyReminderRow,
} from "./opportunity-journey-reminders.service";

const NOW = new Date("2026-09-03T09:00:00.000Z");

function row(
  overrides: Partial<OpportunityJourneyReminderRow> = {},
): OpportunityJourneyReminderRow {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    journeyId: "22222222-2222-4222-8222-222222222222",
    opportunityId: "33333333-3333-4333-8333-333333333333",
    taskId: "44444444-4444-4444-8444-444444444444",
    taskTitle: "Request your second reference",
    taskDueAt: new Date(NOW.getTime() + 70 * 60 * 60 * 1_000),
    state: "preparing",
    applyLinkOpenedAt: null,
    timezone: "Africa/Lagos",
    quietHours: { start: "22:00", end: "08:00" },
    deadlineReminders: true,
    opportunityAlerts: true,
    ...overrides,
  };
}

describe("opportunity journey reminder selection", () => {
  it("selects only the single next required task window", () => {
    expect(selectOpportunityJourneyReminder(row(), NOW)).toMatchObject({
      kind: "journey_task_72h",
      body: "Request your second reference",
    });
    expect(
      selectOpportunityJourneyReminder(
        row({ taskDueAt: new Date(NOW.getTime() + 23 * 60 * 60 * 1_000) }),
        NOW,
      ),
    ).toMatchObject({ kind: "journey_task_24h" });
    expect(
      selectOpportunityJourneyReminder(
        row({ taskDueAt: new Date(NOW.getTime() - 60 * 60 * 1_000) }),
        NOW,
      ),
    ).toMatchObject({ kind: "journey_task_overdue" });
  });

  it("selects an unconfirmed application after 24 hours", () => {
    expect(
      selectOpportunityJourneyReminder(
        row({
          state: "application_opened",
          taskId: null,
          taskTitle: null,
          taskDueAt: null,
          applyLinkOpenedAt: new Date(
            NOW.getTime() - 25 * 60 * 60 * 1_000,
          ),
        }),
        NOW,
      ),
    ).toMatchObject({
      kind: "journey_application_unconfirmed",
      taskId: null,
      title: "Did you submit your application?",
    });
  });

  it.each([
    "applied",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
    "no_response",
    "expired",
    "archived",
  ])("does not send preparation reminders for %s", (state) => {
    expect(selectOpportunityJourneyReminder(row({ state }), NOW)).toBeNull();
  });

  it("respects disabled opportunity and deadline preferences", () => {
    expect(
      selectOpportunityJourneyReminder(row({ opportunityAlerts: false }), NOW),
    ).toBeNull();
    expect(
      selectOpportunityJourneyReminder(row({ deadlineReminders: false }), NOW),
    ).toBeNull();
  });

  it("moves a delivery outside quiet hours", () => {
    const quietNow = new Date("2026-09-03T22:30:00.000Z");
    const delivery = nextOpportunityReminderDeliveryAt(
      quietNow,
      "UTC",
      { start: "22:00", end: "08:00" },
    );
    expect(delivery.toISOString()).toBe("2026-09-04T08:00:00.000Z");
  });
});

describe("OpportunityJourneyRemindersService", () => {
  it("queues a candidate once and counts a duplicate separately", async () => {
    const source = {
      listReminderRows: jest.fn().mockResolvedValue([row(), row({ journeyId: "journey-2" })]),
      queueCandidate: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    };
    const service = new OpportunityJourneyRemindersService(source);

    await expect(service.enqueueDue(NOW)).resolves.toEqual({
      considered: 2,
      queued: 1,
      deduplicated: 1,
    });
    expect(source.queueCandidate).toHaveBeenCalledTimes(2);
  });
});
