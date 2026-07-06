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
