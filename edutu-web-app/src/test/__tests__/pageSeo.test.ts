import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OG_METADATA, PAGE_SEO } from "../../lib/pageSeo.generated";
import { findPageSeo, getPageOgImage } from "../../lib/pageSeo";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("page SEO registry", () => {
  it("uses the canonical screenshot dimensions", () => {
    expect(OG_METADATA).toEqual({
      width: 1200,
      height: 630,
      mimeType: "image/jpeg",
    });
  });

  it("resolves a hero image for every marketing route", () => {
    for (const [routePath, entry] of Object.entries(PAGE_SEO)) {
      expect(getPageOgImage(routePath)).toBe(entry.image);
      expect(entry.image).toMatch(/^https:\/\/www\.edutu\.org\/og\/[a-z0-9-]+\.jpg$/);
    }
  });

  it("gives the homepage its own hero, not the shared logo", () => {
    // The whole point of the exercise: www.edutu.org must unfurl as the
    // homepage hero, not the generic app icon.
    expect(getPageOgImage("/")).toBe("https://www.edutu.org/og/home.jpg");
  });

  it("normalises trailing slashes and query strings", () => {
    expect(findPageSeo("/blog/")?.slug).toBe("blog");
    expect(findPageSeo("/blog?tag=mission")?.slug).toBe("blog");
    expect(findPageSeo("/blog#top")?.slug).toBe("blog");
  });

  it("returns null for unknown or dynamic routes", () => {
    // /blog/:slug is served by the backend OG route, not the static registry.
    expect(findPageSeo("/blog/why-we-built-edutu")).toBeNull();
    expect(findPageSeo("/dashboard")).toBeNull();
    expect(findPageSeo(undefined)).toBeNull();
  });

  it("uses a unique image per route so no two pages unfurl identically", () => {
    const bySlug = new Map<string, string[]>();
    for (const [routePath, entry] of Object.entries(PAGE_SEO)) {
      bySlug.set(entry.slug, [...(bySlug.get(entry.slug) ?? []), routePath]);
    }

    // /scholarship-api and /scholarship-engine are the same page behind two
    // URLs, so they legitimately share copy — but not a slug.
    for (const [slug, paths] of bySlug) {
      expect(paths, `slug "${slug}" is claimed by ${paths.join(", ")}`).toHaveLength(1);
    }
  });

  it("stays in sync with the generator that produces it", () => {
    // pageSeo.generated.ts is codegen; a hand-edit here would silently diverge
    // from the prerendered HTML and the captured images.
    const generated = readFileSync(
      path.join(repoRoot, "src", "lib", "pageSeo.generated.ts"),
      "utf8",
    );
    const source = readFileSync(
      path.join(repoRoot, "scripts", "page-seo.mjs"),
      "utf8",
    );

    expect(generated).toContain("GENERATED FILE — do not edit");

    for (const entry of Object.values(PAGE_SEO)) {
      expect(
        source,
        `slug "${entry.slug}" is in the generated file but not in scripts/page-seo.mjs`,
      ).toContain(`slug: "${entry.slug}"`);
    }
  });

  it("routes every registry entry in vercel.json", () => {
    // A prerendered dist/<path>/index.html is dead weight if the router never
    // serves it — the SPA catch-all would quietly answer with generic tags.
    const config = JSON.parse(
      readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
    ) as { rewrites: { source: string; destination: string }[] };

    const routed = new Set(
      config.rewrites
        .filter((rule) => rule.destination.endsWith("/index.html"))
        .map((rule) => rule.source),
    );

    for (const routePath of Object.keys(PAGE_SEO)) {
      if (routePath === "/") continue;
      expect(routed.has(routePath), `vercel.json has no rewrite for ${routePath}`).toBe(true);
    }
  });
});
