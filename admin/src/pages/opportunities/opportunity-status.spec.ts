import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deadlineDisplay,
  effectiveStatus,
  formatOpportunityDate,
  isExpiredOpportunity,
  isPastDate,
} from "./opportunity-status";

describe("opportunity status helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats valid dates and preserves invalid values", () => {
    expect(formatOpportunityDate("2026-01-15T12:00:00.000Z")).toBe(
      "Jan 15, 2026",
    );
    expect(formatOpportunityDate("not-a-date")).toBe("not-a-date");
    expect(formatOpportunityDate(null)).toBe("");
  });

  it("detects past dates and closed opportunities", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));

    expect(isPastDate("2026-08-05T12:00:00.000Z")).toBe(true);
    expect(isPastDate("2026-08-07T12:00:00.000Z")).toBe(false);
    expect(isExpiredOpportunity({ status: "closed" })).toBe(true);
    expect(
      isExpiredOpportunity({
        status: "active",
        close_date: "2026-08-05T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("displays an active opportunity with a past deadline as closed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));

    expect(
      effectiveStatus({
        status: "active",
        close_date: "2026-08-05T12:00:00.000Z",
      }),
    ).toBe("closed");
    expect(effectiveStatus({ status: "draft" })).toBe("draft");
  });

  it("distinguishes inferred, rolling, and unknown deadlines", () => {
    expect(
      deadlineDisplay({
        close_date: "2026-01-15T12:00:00.000Z",
        metadata: { deadline_confidence: "inferred" },
      }),
    ).toBe("Jan 15, 2026 (est.)");
    expect(
      deadlineDisplay({ metadata: { deadline_confidence: "rolling" } }),
    ).toBe("Rolling");
    expect(deadlineDisplay({})).toBe("Unknown");
  });
});
