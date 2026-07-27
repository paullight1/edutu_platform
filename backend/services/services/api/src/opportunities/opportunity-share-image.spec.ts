import { describe, expect, it } from "@jest/globals";
import { resolveShareImage } from "./opportunity-share-image";

const DEFAULT = "https://www.edutu.org/icons/icon-512x512.png";

describe("resolveShareImage", () => {
  it("prefers the scraped source flyer", () => {
    const r = resolveShareImage(
      {
        metadata: { source_image_url: "https://cdn/flyer.jpg" },
        image_url: "https://cdn/other.jpg",
      },
      { defaultImage: DEFAULT },
    );
    expect(r.url).toBe("https://cdn/flyer.jpg");
    expect(r.usingBrandedCard).toBe(false);
    expect(r.needsCard).toBe(false);
  });

  it("falls to image_url then share card", () => {
    const card = resolveShareImage(
      { metadata: { share_card: { url: "https://cdn/card.png" } } },
      { defaultImage: DEFAULT },
    );
    expect(card.url).toBe("https://cdn/card.png");
    expect(card.usingBrandedCard).toBe(true);
  });

  it("uses a freshly generated card url when the opp has no image yet", () => {
    const r = resolveShareImage(
      { metadata: {} },
      { cardUrl: "https://cdn/new-card.png", defaultImage: DEFAULT },
    );
    expect(r.url).toBe("https://cdn/new-card.png");
    expect(r.usingBrandedCard).toBe(true);
  });

  it("signals needsCard (not the icon) when nothing resolves and no card was generated", () => {
    const r = resolveShareImage({ metadata: {} }, { defaultImage: DEFAULT });
    expect(r.needsCard).toBe(true);
    expect(r.url).toBe(DEFAULT); // only as the absolute last resort
  });
});
