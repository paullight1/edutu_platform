import { describe, expect, it } from "vitest";
import { deadlineDisplayLabel, getDeadlineNotice } from "./opportunityDeadlineNotice";
import type { OpportunityTrust } from "../types/opportunity";

const baseTrust: OpportunityTrust = {
  verificationStatus: "verified",
  lastVerifiedAt: null,
  deadlineConfidence: null,
  deadlineNeedsReview: true,
  verificationMethod: null,
  sourceDomain: null,
};

describe("getDeadlineNotice", () => {
  it("does not show a warning when the deadline is not flagged", () => {
    expect(
      getDeadlineNotice({ ...baseTrust, deadlineNeedsReview: false }),
    ).toBeNull();
    expect(getDeadlineNotice(null)).toBeNull();
  });

  it("explains that inferred dates are estimates rather than conflicts", () => {
    expect(
      getDeadlineNotice({ ...baseTrust, deadlineConfidence: "inferred" }),
    ).toEqual({
      label: "Estimated",
      title: expect.stringContaining("inferred from the listing"),
    });
  });

  it("uses an unconfirmed label when no reliable date evidence exists", () => {
    expect(
      getDeadlineNotice({ ...baseTrust, deadlineConfidence: "unknown" }),
    ).toEqual({
      label: "Unconfirmed",
      title: expect.stringContaining("could not confirm"),
    });
  });

  it("uses review wording for explicit or unspecified dates without claiming a conflict", () => {
    expect(getDeadlineNotice({ ...baseTrust, deadlineConfidence: "explicit" })?.label)
      .toBe("Check date");
    expect(getDeadlineNotice(baseTrust)?.title).toContain("marked for review");
    expect(getDeadlineNotice(baseTrust)?.title).not.toContain("conflicting");
  });

  it("labels unconfirmed dates separately from confirmed deadlines", () => {
    expect(deadlineDisplayLabel(baseTrust)).toBe("Date to verify");
    expect(deadlineDisplayLabel({ ...baseTrust, deadlineNeedsReview: false })).toBe("Deadline");
  });
});
