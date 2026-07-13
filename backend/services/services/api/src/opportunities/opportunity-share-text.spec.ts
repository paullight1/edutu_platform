import { describe, expect, it } from "@jest/globals";
import {
  buildOpportunityPublicShareUrl,
  buildOpportunityShareText,
} from "./opportunity-share-text";

describe("opportunity share text", () => {
  it("builds a WhatsApp-markdown caption for active opportunities", () => {
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
        aiSummary:
          "A global stage for early founders solving real problems with technology.",
        close_date: "2026-07-31",
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

    expect(
      text.startsWith("*2026 KPMG Global Tech Innovator Competition*"),
    ).toBe(true);
    expect(text).toContain(
      "_A global stage for early founders solving real problems with technology._",
    );
    expect(text).toContain("- *Type:* Competitions");
    expect(text).toContain("- *Deadline:* 31 July 2026");
    expect(text).toContain("*What You'll Gain:*");
    expect(text).toContain("- Business Mentorship and Global Exposure");
    expect(text).toContain("- Networking Opportunities");
    expect(text).toContain("*Apply here:*");
    expect(text).toContain("https://www.edutu.org/opportunity/opp-123");
  });

  it("omits optional rows when the opportunity lacks that data", () => {
    const text = buildOpportunityShareText(
      {
        title: "Past Fellowship",
        organization: "Edutu",
        category: "Fellowship",
        close_date: "2020-01-01",
      },
      "/opportunity/past",
    );

    expect(text.startsWith("*Past Fellowship*")).toBe(true);
    expect(text).toContain("- *Type:* Fellowship");
    expect(text).not.toContain("*Duration:*");
    expect(text).not.toContain("*Target Audience:*");
    expect(text).not.toContain("*What You'll Gain:*");
    expect(text).toContain("*Apply here:*");
    expect(text).toContain("/opportunity/past");
  });
});
