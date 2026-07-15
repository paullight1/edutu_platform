import { NotificationsService } from "./notifications.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("NotificationsService web push", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it("no-ops web push when VAPID keys are not configured", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const service = new NotificationsService();
    const result = await (service as any).sendWebPush([{ userId: "u1" }], {
      title: "Reminder",
      body: "Your milestone is due",
    });

    expect(result).toEqual({ sent: 0, skipped: "webpush not configured" });
  });

  it("returns 'no recipients' shape when the recipient list is empty", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";

    const service = new NotificationsService();
    // getWebpush will try to require('web-push'); if absent it degrades to null.
    const result = await (service as any).sendWebPush([], {
      title: "t",
      body: "b",
    });

    // Either "not configured" (package missing) or "no recipients"-style {sent:0}.
    expect(result.sent).toBe(0);
  });
});

describe("NotificationsService push preference gate", () => {
  const service = new NotificationsService();
  const allowsPush = (prefs: unknown, kind?: string) =>
    (service as any).allowsPush(prefs, kind);

  const enabled = {
    pushNotifications: true,
    emailNotifications: false,
    opportunityAlerts: true,
    deadlineReminders: true,
    goalReminders: true,
    achievementCelebrations: true,
    quietHours: null,
    timezone: null,
  };

  it("allows push when the user has no preferences row", () => {
    // The column defaults are permissive; absence must not mute a user.
    expect(allowsPush(undefined, "opportunity-alert")).toBe(true);
  });

  it("mutes every kind when the master switch is off", () => {
    const prefs = { ...enabled, pushNotifications: false };
    for (const kind of [
      "opportunity-alert",
      "deadline-reminder",
      "goal-reminder",
      "admin-broadcast",
      undefined,
    ]) {
      expect(allowsPush(prefs, kind)).toBe(false);
    }
  });

  it("mutes only the matching topic", () => {
    const prefs = { ...enabled, opportunityAlerts: false };
    expect(allowsPush(prefs, "opportunity-alert")).toBe(false);
    expect(allowsPush(prefs, "deadline-reminder")).toBe(true);
    expect(allowsPush(prefs, "goal-reminder")).toBe(true);
  });

  it.each([
    ["deadline-reminder", "deadlineReminders"],
    ["goal-reminder", "goalReminders"],
    ["achievement", "achievementCelebrations"],
  ])("maps kind %s to preference %s", (kind, column) => {
    expect(allowsPush({ ...enabled, [column]: false }, kind)).toBe(false);
    expect(allowsPush({ ...enabled, [column]: true }, kind)).toBe(true);
  });

  it("allows kinds with no topic switch through the master switch alone", () => {
    // Transactional/admin notices have no per-topic opt-out of their own.
    expect(
      allowsPush({ ...enabled, opportunityAlerts: false }, "admin-broadcast"),
    ).toBe(true);
    expect(allowsPush(enabled, "some-future-kind")).toBe(true);
    expect(allowsPush(enabled, undefined)).toBe(true);
  });
});
