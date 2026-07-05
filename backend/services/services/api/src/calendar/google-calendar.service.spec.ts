import { buildGoalEventBody, GoogleCalendarService } from "./google-calendar.service";

jest.mock("../db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

describe("buildGoalEventBody", () => {
  it("maps a dated goal to an all-day event with exclusive end + Edutu marker", () => {
    const body: any = buildGoalEventBody({
      id: "goal-1",
      title: "Draft your SOP",
      description: "Write the first draft",
      targetDate: "2026-08-01T09:00:00.000Z",
    });

    expect(body.summary).toBe("Draft your SOP");
    expect(body.start).toEqual({ date: "2026-08-01" });
    expect(body.end).toEqual({ date: "2026-08-02" }); // exclusive end = +1 day
    expect(body.extendedProperties.private.edutuGoalId).toBe("goal-1");
    expect(body.reminders.overrides[0].minutes).toBe(24 * 60);
  });

  it("falls back to the legacy deadline field", () => {
    const body: any = buildGoalEventBody({
      id: "g2",
      title: "Submit",
      deadline: "2026-09-10",
    });
    expect(body.start).toEqual({ date: "2026-09-10" });
  });

  it("returns null when the goal has no date", () => {
    expect(buildGoalEventBody({ id: "g3", title: "No date" })).toBeNull();
  });
});

describe("GoogleCalendarService config gating", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("is not configured and returns no auth url without Google creds", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    const service = new GoogleCalendarService();
    expect(service.isConfigured()).toBe(false);
    expect(service.getAuthUrl("user-1")).toBeNull();
  });

  it("outbound syncGoal is a no-op for a goal with no date", async () => {
    const service = new GoogleCalendarService();
    await expect(
      service.syncGoal("user-1", { id: "g", title: "t" }),
    ).resolves.toBeUndefined();
  });
});
