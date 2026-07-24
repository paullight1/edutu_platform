import { afterEach, describe, expect, it, vi } from "vitest";
import type { Opportunity } from "../../types/opportunity";
import {
  buildOpportunityShareFileName,
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  buildShareMessage,
  fetchOpportunityShareImageBlob,
  fetchOpportunitySharePdfBlob,
  shareOpportunity,
  shareTextIncludesUrl,
} from "../../services/opportunityShare";

const opportunity: Opportunity = {
  id: "opp-123",
  title: "Global Leadership Fellowship",
  organization: "Edutu Foundation",
  category: "Fellowship",
  deadline: "2026-08-01T00:00:00.000Z",
  location: "Worldwide",
  description:
    "A fully funded leadership fellowship for emerging builders who want to create public impact across Africa and beyond.",
  requirements: [],
  benefits: [],
  applicationProcess: [],
  match: 92,
  difficulty: "Medium",
};

describe("opportunityShare helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a public share URL on the current origin", () => {
    expect(buildOpportunityShareUrl(opportunity.id)).toContain(
      "/opportunity/opp-123",
    );
    expect(buildOpportunityShareUrl(opportunity.id)).toMatch(/^https?:\/\//);
  });

  it("builds a WhatsApp-markdown share message with the public portal link", () => {
    const shareUrl = buildOpportunityShareUrl(opportunity.id);
    const message = buildOpportunityShareText(opportunity, shareUrl);

    expect(message.startsWith("*Global Leadership Fellowship*")).toBe(true);
    expect(message).toContain(
      "_A fully funded leadership fellowship for emerging builders",
    );
    expect(message).toContain("- *Type:* Fellowship");
    expect(message).toContain("- *Deadline:* 1 August 2026");
    // No benefits on this fixture → no hollow "What You'll Gain" heading.
    expect(message).not.toContain("*What You'll Gain:*");
    expect(message).toContain("*Apply here:*");
    expect(message).toContain(shareUrl);
  });

  it("creates safe filenames for share assets", () => {
    expect(buildOpportunityShareFileName(opportunity, "pdf")).toBe(
      "global-leadership-fellowship-edutu.pdf",
    );
    expect(buildOpportunityShareFileName(opportunity, "png")).toBe(
      "global-leadership-fellowship-edutu.png",
    );
    expect(buildOpportunityShareFileName(opportunity, "svg")).toBe(
      "global-leadership-fellowship-edutu.svg",
    );
  });

  it("fetches the generated image blob from the share-card URL", async () => {
    const imageBlob = new Blob(["png"], { type: "image/png" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          shareText: "Still Active!\n\nShared backend caption",
          shareUrl: "https://www.edutu.org/share/opportunity/opp-123",
          shareCard: {
            url: "https://cdn.example.com/share.png",
            path: "active/opp-123.png",
            format: "png",
            generatedAt: "2026-06-18T00:00:00.000Z",
            fingerprint: "abc123",
            expiresAt: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValue(imageBlob),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOpportunityShareImageBlob(opportunity.id);

    expect(result?.blob).toBe(imageBlob);
    expect(result?.card.url).toBe("https://cdn.example.com/share.png");
    expect(result?.shareText).toContain("Shared backend caption");
    expect(result?.shareUrl).toBe("https://www.edutu.org/share/opportunity/opp-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the backend PDF route before falling back to browser generation", async () => {
    const pdfBlob = new Blob(["pdf"], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(pdfBlob),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOpportunitySharePdfBlob(opportunity.id)).resolves.toBe(
      pdfBlob,
    );

    expect(fetchMock).toHaveBeenCalled();
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/share-pdf");
    expect(requestInit).toMatchObject({ method: "GET" });
  });
});

describe("share link dedup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects the link inside a caption regardless of www/trailing-slash form", () => {
    const caption = "*Title*\n\n*Apply here:*\n\nhttps://www.edutu.org/opportunity/opp-123";
    expect(shareTextIncludesUrl(caption, "https://www.edutu.org/opportunity/opp-123")).toBe(true);
    expect(shareTextIncludesUrl(caption, "https://edutu.org/opportunity/opp-123")).toBe(true);
    expect(shareTextIncludesUrl(caption, "https://www.edutu.org/opportunity/opp-123/")).toBe(true);
    expect(shareTextIncludesUrl(caption, "https://www.edutu.org/opportunity/other")).toBe(false);
  });

  it("never duplicates the link when composing a share message", () => {
    const url = "https://www.edutu.org/opportunity/opp-123";
    const withLink = `caption\n\n${url}`;
    expect(buildShareMessage(withLink, url)).toBe(withLink);
    expect(buildShareMessage("caption", url)).toBe(`caption\n\n${url}`);
  });

  it("omits the separate url from navigator.share when the caption already carries it", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: shareSpy,
      clipboard: { writeText: vi.fn() },
    });

    // withImage: false → no card fetch; the local caption ends with the link.
    const outcome = await shareOpportunity(opportunity, { withImage: false });

    expect(outcome).toBe("shared-link");
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const shared = shareSpy.mock.calls[0][0];
    expect(shared.text).toContain("/opportunity/opp-123");
    expect(shared.url).toBeUndefined();
  });
});
