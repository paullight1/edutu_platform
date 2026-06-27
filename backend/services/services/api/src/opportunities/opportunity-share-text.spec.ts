import { describe, expect, it } from "@jest/globals";
import {
  buildOpportunityPublicShareUrl,
  buildOpportunityShareText,
} from "./opportunity-share-text";

describe("opportunity share text", () => {
  it("builds the compact social caption style for active opportunities", () => {
    const shareUrl = buildOpportunityPublicShareUrl(
      "opp-123",
      "https://www.edutu.org",
    );
    const text = buildOpportunityShareText(
      {
        id: "opp-123",
        title: "2026 KPMG Global Tech Innovator Competition",
        organization: "KPMG",
        category: "Competitions",
        close_date: null,
        target_region: "All Countries",
        metadata: {
          benefits: [
            "Business Mentorship and Global Exposure",
            "Networking Opportunities",
          ],
        },
      },
      shareUrl,
    );

    expect(text).toContain("Still Active!");
    expect(text).toContain("Sponsor: KPMG");
    expect(text).toContain("⭐Business Mentorship and Global Exposure");
    expect(text).toContain("✅Networking Opportunities");
    expect(text).toContain("Category: Competitions");
    expect(text).toContain("Eligible Country: All Countries");
    expect(text).toContain("Deadline: Not Specified");
    expect(text).toContain("Click the link below to apply📌");
    expect(text).toContain("https://www.edutu.org/opportunity/opp-123");
    expect(text).toContain("Kindly share with your friends");
  });

  it("marks expired opportunities without changing the caption structure", () => {
    const text = buildOpportunityShareText(
      {
        title: "Past Fellowship",
        organization: "Edutu",
        category: "Fellowship",
        close_date: "2020-01-01",
      },
      "/opportunity/past",
    );

    expect(text.startsWith("Deadline Passed!")).toBe(true);
    expect(text).toContain("Click the link below to apply📌");
  });
});
