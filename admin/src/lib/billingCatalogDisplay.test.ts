import { describe, expect, it } from "vitest";
import { formatBillingTerm } from "./billingCatalogDisplay";

describe("formatBillingTerm", () => {
  it.each(["weekly", "monthly", "yearly"])(
    "shows the %s billing cadence for recurring plans",
    (cadence) => {
      expect(formatBillingTerm({ renewalMode: "recurring", cadence, validityDays: null }))
        .toBe(`Recurring · ${cadence[0].toUpperCase()}${cadence.slice(1)}`);
    },
  );

  it("does not display an empty duration for recurring plans with missing cadence", () => {
    expect(formatBillingTerm({ renewalMode: "recurring", cadence: " ", validityDays: null }))
      .toBe("Recurring · Billing period not set");
  });

  it("shows duration for one-time passes when configured", () => {
    expect(formatBillingTerm({ renewalMode: "one_time", cadence: "none", validityDays: 30 }))
      .toBe("One-time · 30 days");
  });

  it("does not invent a duration for one-time passes without an expiry", () => {
    expect(formatBillingTerm({ renewalMode: "one_time", cadence: "none", validityDays: null }))
      .toBe("One-time");
  });
});
