import {
  buildEventFields,
  buildVevent,
  CalendarSyncService,
} from "./calendar-sync.service";

jest.mock("../db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

describe("buildEventFields", () => {
  it("maps a dated goal to normalized event fields", () => {
    expect(
      buildEventFields({
        id: "g1",
        title: "Draft SOP",
        description: "Write it",
        targetDate: "2026-08-01T09:00:00.000Z",
      }),
    ).toEqual({
      goalId: "g1",
      title: "Draft SOP",
      description: "Write it",
      dateOnly: "2026-08-01",
    });
  });

  it("falls back to the deadline and returns null without a date", () => {
    expect(buildEventFields({ id: "g2", title: "Submit", deadline: "2026-09-10" })?.dateOnly).toBe(
      "2026-09-10",
    );
    expect(buildEventFields({ id: "g3", title: "No date" })).toBeNull();
  });
});

describe("buildVevent", () => {
  const stamp = "20260705T000000Z";
  it("emits an all-day VEVENT with exclusive end, alarm and stable UID", () => {
    const vevent = buildVevent(
      { goalId: "g1", title: "Prep, review; go", description: "line1\nline2", dateOnly: "2026-08-01" },
      stamp,
    );
    expect(vevent).toContain("UID:edutu-g1@edutu");
    expect(vevent).toContain("DTSTART;VALUE=DATE:20260801");
    expect(vevent).toContain("DTEND;VALUE=DATE:20260802");
    expect(vevent).toContain("SUMMARY:Prep\\, review\\; go");
    expect(vevent).toContain("DESCRIPTION:line1\\nline2");
    expect(vevent).toContain("TRIGGER:-P1D");
  });
});

describe("CalendarSyncService config gating", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("reports providers unconfigured without env and gives no auth url", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.MS_CLIENT_ID;
    const service = new CalendarSyncService();
    expect(service.isProviderConfigured("google")).toBe(false);
    expect(service.isProviderConfigured("outlook")).toBe(false);
    expect(service.isProviderConfigured("apple_caldav")).toBe(true);
    expect(service.getAuthUrl("u1", "google")).toBeNull();
    expect(service.getAuthUrl("u1", "outlook")).toBeNull();
  });

  it("builds provider auth urls when configured, tagging state with the provider", () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsec";
    process.env.GOOGLE_REDIRECT_URI = "https://api.example.com/calendar/callback";
    process.env.MS_CLIENT_ID = "mid";
    process.env.MS_CLIENT_SECRET = "msec";
    process.env.MS_REDIRECT_URI = "https://api.example.com/calendar/callback";
    const service = new CalendarSyncService();

    const google = service.getAuthUrl("u1", "google")!;
    expect(google).toContain("accounts.google.com");
    expect(google).toContain("state=google%3Au1");

    const outlook = service.getAuthUrl("u1", "outlook")!;
    expect(outlook).toContain("login.microsoftonline.com");
    expect(outlook).toContain("state=outlook%3Au1");
  });
});
