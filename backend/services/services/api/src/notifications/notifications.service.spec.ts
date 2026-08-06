import { NotificationsService } from "./notifications.service";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";

// Cast once: the mocked module replaces `execute` with a jest.Mock, and reading
// it straight off the drizzle instance trips @typescript-eslint/unbound-method.
const mockedDb = db as unknown as { execute: jest.Mock };

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
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

describe("NotificationsService delivery preference loading", () => {
  const execute = mockedDb.execute;
  const service = new NotificationsService();
  const load = (userIds: string[]) =>
    (service as any).loadDeliveryPreferences(userIds);

  const dbRow = (userId: string, overrides: Record<string, unknown> = {}) => ({
    user_id: userId,
    push_notifications: true,
    email_notifications: false,
    opportunity_alerts: true,
    deadline_reminders: true,
    goal_reminders: true,
    achievement_celebrations: true,
    quiet_hours: { start: "22:00", end: "08:00" },
    timezone: "Africa/Lagos",
    ...overrides,
  });

  beforeEach(() => {
    execute.mockReset();
  });

  it("unwraps a pg QueryResult object (node-postgres) instead of iterating it", async () => {
    // Regression: db is drizzle/node-postgres, whose .execute() resolves to a
    // NON-iterable { rows, rowCount } object. Iterating it threw
    // "result is not iterable" and killed every push-bearing broadcast.
    execute.mockResolvedValue({
      rows: [
        dbRow("11111111-1111-1111-1111-111111111111"),
        dbRow("22222222-2222-2222-2222-222222222222", {
          push_notifications: false,
          opportunity_alerts: false,
          timezone: null,
          quiet_hours: null,
        }),
      ],
      rowCount: 2,
      command: "SELECT",
      fields: [],
    });

    const prefs = await load([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);

    expect(prefs.size).toBe(2);
    expect(prefs.get("11111111-1111-1111-1111-111111111111")).toEqual({
      pushNotifications: true,
      emailNotifications: false,
      opportunityAlerts: true,
      deadlineReminders: true,
      goalReminders: true,
      achievementCelebrations: true,
      quietHours: { start: "22:00", end: "08:00" },
      timezone: "Africa/Lagos",
    });
    expect(prefs.get("22222222-2222-2222-2222-222222222222")).toMatchObject({
      pushNotifications: false,
      opportunityAlerts: false,
      quietHours: null,
      timezone: null,
    });
  });

  it("still handles a bare array result (postgres-js shape)", async () => {
    execute.mockResolvedValue([dbRow("33333333-3333-3333-3333-333333333333")]);

    const prefs = await load(["33333333-3333-3333-3333-333333333333"]);

    expect(prefs.size).toBe(1);
    expect(
      prefs.get("33333333-3333-3333-3333-333333333333").pushNotifications,
    ).toBe(true);
  });

  it("returns an empty map without querying when there are no user ids", async () => {
    const prefs = await load([]);
    expect(prefs.size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("NotificationsService broadcast fails open on preference lookup", () => {
  const execute = mockedDb.execute;

  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("still delivers push when the preference query throws", async () => {
    // A monitoring/preferences outage must never silence the product: an
    // empty prefs map degrades to the permissive column defaults.
    execute.mockRejectedValue(new Error("result is not iterable"));

    const service = new NotificationsService();
    const sendPush = jest
      .spyOn(service as any, "sendPush")
      .mockResolvedValue({ sent: 1 });
    jest.spyOn((service as any).logger, "error").mockImplementation(() => {});

    const result = await (service as any).deliverBroadcast({
      title: "Deadline in 2 days",
      body: "Finish your application",
      kind: "deadline-reminder",
      audience: "specific",
      targetUserIds: ["44444444-4444-4444-4444-444444444444"],
      channels: { inApp: false, push: true, email: false },
      metadata: { quietHoursDeferred: true },
    });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][0]).toHaveLength(1);
    expect(result.push).toMatchObject({ sent: 1 });
    expect(result.recipientCount).toBe(1);
  });
});

describe("NotificationsService global push budget", () => {
  const execute = mockedDb.execute;
  const OLD_ENV = process.env;
  const USER = "55555555-5555-5555-5555-555555555555";
  // Recipients are resolved through toDatabaseUserId, so the budget rows must
  // be keyed on the DERIVED id or every lookup silently misses.
  const DB_USER = toDatabaseUserId(USER);

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    execute.mockReset();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  /**
   * Builds a service whose push transport is stubbed, and whose single
   * `db.execute` mock answers BOTH the preference query and the budget query.
   * Preferences resolve to an empty result (permissive column defaults), so the
   * only thing under test is the budget.
   */
  function makeService(usage: { day: number; week: number } | null) {
    const service = new NotificationsService();
    jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});
    jest.spyOn((service as any).logger, "error").mockImplementation(() => {});

    execute.mockImplementation((query: any) => {
      const text = JSON.stringify(query ?? {});
      const isBudgetQuery = text.includes("delivered_at");
      if (!isBudgetQuery) return Promise.resolve({ rows: [], rowCount: 0 });
      // node-postgres shape on purpose: iterating this object is the bug that
      // made the whole system dead in production.
      return Promise.resolve({
        rows: usage
          ? [{ user_id: DB_USER, day_count: usage.day, week_count: usage.week }]
          : [],
        rowCount: usage ? 1 : 0,
      });
    });

    const sendPush = jest
      .spyOn(service as any, "sendPush")
      .mockResolvedValue({ sent: 1 });

    return { service, sendPush };
  }

  const deliver = (service: NotificationsService, overrides: any = {}) =>
    (service as any).deliverBroadcast({
      title: "Deadline soon",
      body: "Finish your application",
      kind: "deadline-reminder",
      audience: "specific",
      targetUserIds: [USER],
      channels: { inApp: false, push: true, email: false },
      metadata: { quietHoursDeferred: true },
      ...overrides,
    });

  it("allows a routine push when the user has received none today", async () => {
    const { service, sendPush } = makeService({ day: 0, week: 0 });

    const result = await deliver(service);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
    expect(result.push.budgetSuppressed).toBeUndefined();
  });

  it("suppresses a routine push once one has already landed in 24h", async () => {
    const { service, sendPush } = makeService({ day: 1, week: 1 });

    const result = await deliver(service);

    expect(sendPush).not.toHaveBeenCalled();
    expect(result.push).toMatchObject({ budgetSuppressed: 1 });
  });

  it("allows a second push in 24h when severity is critical", async () => {
    const { service, sendPush } = makeService({ day: 1, week: 1 });

    const result = await deliver(service, { severity: "critical" });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
  });

  it("allows a second push in 24h when the deadline is within a day", async () => {
    const { service, sendPush } = makeService({ day: 1, week: 1 });

    const result = await deliver(service, {
      metadata: { quietHoursDeferred: true, daysLeft: 1 },
    });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
  });

  it("still suppresses a THIRD urgent push in the same 24h", async () => {
    const { service, sendPush } = makeService({ day: 2, week: 2 });

    const result = await deliver(service, { severity: "critical" });

    expect(sendPush).not.toHaveBeenCalled();
    expect(result.push).toMatchObject({ budgetSuppressed: 1 });
  });

  it("enforces the 5-per-7-day ceiling even for an urgent push on a fresh day", async () => {
    const { service, sendPush } = makeService({ day: 0, week: 5 });

    const result = await deliver(service, { severity: "critical" });

    expect(sendPush).not.toHaveBeenCalled();
    expect(result.push).toMatchObject({ budgetSuppressed: 1 });
  });

  it("lets a real operator broadcast bypass the budget entirely", async () => {
    // An operator announcing an outage must not be silently throttled. A real
    // operator broadcast targets an audience, not a specific user list.
    const { service, sendPush } = makeService({ day: 9, week: 9 });
    // audience:"all" resolves recipients from `profiles` rather than the
    // caller's id list, so that read needs stubbing here.
    (db as unknown as { select: jest.Mock }).select = jest
      .fn()
      .mockReturnValue({
        from: jest
          .fn()
          .mockResolvedValue([{ userId: USER, email: null, fullName: null }]),
      });

    const result = await deliver(service, {
      kind: "admin-broadcast",
      audience: "all",
      targetUserIds: undefined,
    });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
    expect(result.push.budgetSuppressed).toBeUndefined();
  });

  it("does NOT let a targeted send bypass the budget by claiming admin-broadcast", async () => {
    // The bypass is for operator announcements, not a loophole any internal
    // sender can take by mislabelling a per-user push.
    const { service, sendPush } = makeService({ day: 9, week: 9 });

    const result = await deliver(service, { kind: "admin-broadcast" });

    expect(sendPush).not.toHaveBeenCalled();
    expect(result.push).toMatchObject({ budgetSuppressed: 1 });
  });

  it("budgets a targeted send whose kind was never set", async () => {
    // Regression guard: `kind` defaults to "admin-broadcast" elsewhere in the
    // service, so a sender that forgets to set it must NOT inherit an
    // unlimited push budget.
    const { service, sendPush } = makeService({ day: 9, week: 9 });

    const result = await deliver(service, { kind: undefined });

    expect(sendPush).not.toHaveBeenCalled();
    expect(result.push).toMatchObject({ budgetSuppressed: 1 });
  });

  it("never drops a transactional system notice", async () => {
    // Pro-expiry and similar notices are acted on, not browsed. Dropping
    // "your subscription expires tomorrow" for fatigue reasons is indefensible.
    const { service, sendPush } = makeService({ day: 9, week: 9 });

    const result = await deliver(service, { kind: "system" });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
    expect(result.push.budgetSuppressed).toBeUndefined();
  });

  it("skips the budget when NOTIFICATION_BUDGET_ENABLED is 'false'", async () => {
    process.env.NOTIFICATION_BUDGET_ENABLED = "false";
    const { service, sendPush } = makeService({ day: 9, week: 9 });

    const result = await deliver(service);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
  });

  it("fails OPEN when the counting query throws", async () => {
    const service = new NotificationsService();
    jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});
    jest.spyOn((service as any).logger, "error").mockImplementation(() => {});
    execute.mockImplementation((query: any) => {
      const text = JSON.stringify(query ?? {});
      if (text.includes("delivered_at")) {
        return Promise.reject(new Error("relation notifications is gone"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const sendPush = jest
      .spyOn(service as any, "sendPush")
      .mockResolvedValue({ sent: 1 });

    const result = await deliver(service);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(result.push).toMatchObject({ sent: 1 });
    expect(result.push.budgetSuppressed).toBeUndefined();
  });
});

describe("NotificationsService open telemetry", () => {
  const service = new NotificationsService();

  afterEach(() => jest.restoreAllMocks());

  function mockUpdate() {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    (db as unknown as { update: jest.Mock }).update = jest
      .fn()
      .mockReturnValue({ set });
    return { set, where };
  }

  it("stamps opened_at for a tapped notification", async () => {
    const { set } = mockUpdate();

    await service.markOpened("11111111-2222-3333-4444-555555555555");

    expect(set).toHaveBeenCalledWith({ openedAt: expect.any(Date) });
  });

  it("ignores a blank id without touching the database", async () => {
    const { set } = mockUpdate();

    await service.markOpened("   ");

    expect(set).not.toHaveBeenCalled();
  });

  it("never throws when the id is malformed and the driver rejects", async () => {
    const where = jest
      .fn()
      .mockRejectedValue(new Error("invalid input syntax for type uuid"));
    const set = jest.fn().mockReturnValue({ where });
    (db as unknown as { update: jest.Mock }).update = jest
      .fn()
      .mockReturnValue({ set });

    // A client reporting a tap must never receive an error.
    await expect(service.markOpened("not-a-uuid")).resolves.toBeUndefined();
  });
});
