import {
  buildGhostNudge,
  ghostThresholdDays,
} from "../application-ghost-closure.service";

const NOW = new Date("2026-07-20T10:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const baseRow = {
  application_id: "app-1",
  user_id: "user-1",
  title: "Mastercard Foundation Scholars Program",
};

describe("buildGhostNudge", () => {
  it("nudges an application submitted 50 days ago with the ghost dedupe key", () => {
    const nudge = buildGhostNudge(
      { ...baseRow, status: "submitted", submitted_at: daysAgo(50) },
      { thresholdDays: 45, now: NOW },
    );

    expect(nudge).not.toBeNull();
    expect(nudge!.dedupeKey).toBe("ghost:app-1");
    expect(nudge!.title).toBe(
      "Still waiting on Mastercard Foundation Scholars Program?",
    );
    // floor(50 / 7) === 7 weeks
    expect(nudge!.body).toBe(
      "It's been 7 weeks with no reply — that usually means they moved on, " +
        "and it says nothing about you. Close it out and free the space; " +
        "your next best shot is ready.",
    );
    expect(nudge!.metadata).toMatchObject({
      applicationId: "app-1",
      url: "/applied",
      source: "ghost-closure",
    });
    // Scheduled into the near future so the shared queue path can defer for
    // quiet hours at delivery time.
    expect(new Date(nudge!.scheduledFor!).getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it("does not nudge an application submitted only 30 days ago", () => {
    expect(
      buildGhostNudge(
        { ...baseRow, status: "submitted", submitted_at: daysAgo(30) },
        { thresholdDays: 45, now: NOW },
      ),
    ).toBeNull();
  });

  it.each([
    "offer",
    "rejected",
    "withdrawn",
    "no_response",
    "draft",
    "interview",
  ])("does not nudge a '%s' application even when long silent", (status) => {
    expect(
      buildGhostNudge(
        { ...baseRow, status, submitted_at: daysAgo(90) },
        { thresholdDays: 45, now: NOW },
      ),
    ).toBeNull();
  });

  it("returns null for a missing or invalid submitted_at", () => {
    expect(
      buildGhostNudge(
        { ...baseRow, status: "submitted", submitted_at: null },
        { thresholdDays: 45, now: NOW },
      ),
    ).toBeNull();
    expect(
      buildGhostNudge(
        { ...baseRow, status: "submitted", submitted_at: "not-a-date" },
        { thresholdDays: 45, now: NOW },
      ),
    ).toBeNull();
  });

  it("falls back to a generic title when the opportunity title is missing", () => {
    const nudge = buildGhostNudge(
      {
        ...baseRow,
        title: null,
        status: "submitted",
        submitted_at: daysAgo(60),
      },
      { thresholdDays: 45, now: NOW },
    );

    expect(nudge!.title).toBe("Still waiting on your application?");
    // floor(60 / 7) === 8 weeks
    expect(nudge!.body).toContain("8 weeks");
  });
});

describe("ghostThresholdDays", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("defaults to 45 when unset", () => {
    delete process.env.APPLICATION_GHOST_DAYS;
    expect(ghostThresholdDays()).toBe(45);
  });

  it("defaults to 45 when malformed", () => {
    process.env.APPLICATION_GHOST_DAYS = "not-a-number";
    expect(ghostThresholdDays()).toBe(45);
  });

  it("defaults to 45 for a non-positive value", () => {
    process.env.APPLICATION_GHOST_DAYS = "0";
    expect(ghostThresholdDays()).toBe(45);
  });

  it("honors a valid override", () => {
    process.env.APPLICATION_GHOST_DAYS = "60";
    expect(ghostThresholdDays()).toBe(60);
  });
});
