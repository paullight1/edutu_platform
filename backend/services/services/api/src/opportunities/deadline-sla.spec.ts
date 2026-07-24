import {
  deadlineSlaPenalty,
  DEADLINE_SLA_GRACE_HOURS,
  DEADLINE_SLA_PENALTY,
} from "./deadline-sla";

const NOW = new Date("2026-07-24T12:00:00.000Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("deadlineSlaPenalty", () => {
  it("does not penalize an opportunity that has a date", () => {
    expect(
      deadlineSlaPenalty({
        hasDate: true,
        confidence: "unknown",
        firstSeenAt: hoursAgo(1000),
        now: NOW,
      }),
    ).toBe(0);
  });

  it("does not penalize an explicitly rolling opportunity", () => {
    expect(
      deadlineSlaPenalty({
        hasDate: false,
        confidence: "rolling",
        firstSeenAt: hoursAgo(1000),
        now: NOW,
      }),
    ).toBe(0);
  });

  it("gives dateless-unknown rows a grace window before penalizing", () => {
    expect(
      deadlineSlaPenalty({
        hasDate: false,
        confidence: "unknown",
        firstSeenAt: hoursAgo(DEADLINE_SLA_GRACE_HOURS - 1),
        now: NOW,
      }),
    ).toBe(0);
  });

  it("penalizes a dateless-unknown row past the grace window", () => {
    expect(
      deadlineSlaPenalty({
        hasDate: false,
        confidence: "unknown",
        firstSeenAt: hoursAgo(DEADLINE_SLA_GRACE_HOURS + 1),
        now: NOW,
      }),
    ).toBe(DEADLINE_SLA_PENALTY);
  });

  it("penalizes when first-seen is unknown (can't prove it's new)", () => {
    expect(
      deadlineSlaPenalty({
        hasDate: false,
        confidence: null,
        firstSeenAt: null,
        now: NOW,
      }),
    ).toBe(DEADLINE_SLA_PENALTY);
  });
});
