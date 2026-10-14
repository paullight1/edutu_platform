import { describe, expect, it } from "vitest";
import { cleanOpportunityText } from "./opportunityContent";

describe("cleanOpportunityText", () => {
  it("removes common source-site bot challenge pages", () => {
    expect(
      cleanOpportunityText(
        "To access this website, please wait while we complete a security check. I'm not a robot.",
      ),
    ).toBe("");
    expect(cleanOpportunityText("Attention Required | Cloudflare")).toBe("");
    expect(
      cleanOpportunityText("Enable JavaScript and cookies to continue"),
    ).toBe("");
  });

  it("keeps legitimate opportunity content and treats missing text as empty", () => {
    const description = "Applications are open to postgraduate students.";
    expect(cleanOpportunityText(description)).toBe(description);
    expect(cleanOpportunityText(undefined)).toBe("");
    expect(cleanOpportunityText(null)).toBe("");
  });
});
