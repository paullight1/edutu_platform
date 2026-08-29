import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function componentSource(name: string): string {
  return readFileSync(resolve(process.cwd(), "src/components", name), "utf8");
}

describe("mobile opportunity layout", () => {
  it("owns the responsive layout in the opportunity components", () => {
    const entry = componentSource("OpportunitiesPage.tsx");
    const archive = componentSource("OpportunitiesPageLegacy.tsx");

    expect(entry).not.toContain("createPortal");
    expect(entry).not.toContain("!important");
    expect(archive).toContain("More opportunity filters");
    expect(archive).toContain("sm:hidden");
    expect(archive).toContain("sticky top-[calc(4rem+env(safe-area-inset-top))]");
  });

  it("uses compact two-column cards for mobile opportunity results", () => {
    const archive = componentSource("OpportunitiesPageLegacy.tsx");

    expect(archive).toContain("mobile-opportunity-results-grid");
    expect(archive).toContain("mobile-opportunity-result-card");
    expect(archive).toContain("grid-cols-2 gap-3");
    expect(archive).toContain("mobile-opportunity-result-media");
  });

  it("keeps public desktop cards but adds compact mobile filters and rows", () => {
    const archive = componentSource("PublicOpportunitiesArchivePage.tsx");

    expect(archive).toContain("More opportunity categories");
    expect(archive).toContain("Public opportunity filters");
    expect(archive).toContain("sm:hidden");
    expect(archive).toContain("hidden sm:grid");
  });
});
