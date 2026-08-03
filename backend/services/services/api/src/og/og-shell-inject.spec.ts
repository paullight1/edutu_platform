import { OG_INJECTED_MARKER, injectIntoShell } from "./og-shell-inject";
import type { OgPageMeta } from "./og-page.render";

/**
 * The shell these routes rewrite is the REAL app served to real users, so the
 * bar is: correct tags for crawlers, and an untouched bundle for humans.
 */
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Edutu | AI-powered global opportunities</title>
    <meta
      name="description"
      content="Generic shell description."
    />
    <link rel="canonical" href="https://www.edutu.org/" />
    <meta property="og:image" content="https://www.edutu.org/og/home.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <script type="module" src="/assets/index-abc123.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const META: OgPageMeta = {
  title: "Why We Built Edutu — Edutu Blog",
  description: "Talent is everywhere, but opportunity is not.",
  image: "https://cdn.example.com/cover.png",
  imageAlt: "Why We Built Edutu",
  url: "https://www.edutu.org/blog/why-we-built-edutu",
  ogType: "article",
  ctaLabel: "Read this post on Edutu →",
};

describe("injectIntoShell", () => {
  it("replaces the shell's own metadata rather than appending duplicates", () => {
    const html = injectIntoShell(SHELL, META);

    expect(html).not.toBeNull();
    // The shell's tags are Prettier-wrapped across lines; a single-line regex
    // would append instead of replace and crawlers would read the wrong one.
    expect(html!.match(/property="og:image"/g)).toHaveLength(1);
    expect(html!.match(/name="description"/g)).toHaveLength(1);
    expect(html!.match(/<title>/g)).toHaveLength(1);
    expect(html!.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).not.toContain("Generic shell description.");
    expect(html).not.toContain("/og/home.jpg");
  });

  it("carries the item's title, image and canonical URL", () => {
    const html = injectIntoShell(SHELL, META)!;

    expect(html).toContain("<title>Why We Built Edutu — Edutu Blog</title>");
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn.example.com/cover.png" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://cdn.example.com/cover.png" />',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://www.edutu.org/blog/why-we-built-edutu" />',
    );
    expect(html).toContain('<meta property="og:type" content="article" />');
  });

  it("keeps the app bootable — the bundle script survives injection", () => {
    const html = injectIntoShell(SHELL, META)!;

    // These responses reach real users, not just crawlers. Losing the entry
    // script would replace the app with a blank page on every shared link.
    expect(html).toContain(
      '<script type="module" src="/assets/index-abc123.js"></script>',
    );
    expect(html).toContain('<div id="root"></div>');
  });

  it("drops inherited image dimensions when the item's are unknown", () => {
    const html = injectIntoShell(SHELL, META)!;

    // Stale 1200x630 from the shell would make Twitter letterbox a portrait
    // cover image.
    expect(html).not.toContain('property="og:image:width"');
    expect(html).not.toContain('property="og:image:height"');
  });

  it("keeps dimensions the caller does supply", () => {
    const html = injectIntoShell(SHELL, {
      ...META,
      imageWidth: 1080,
      imageHeight: 1350,
    })!;

    expect(html).toContain('<meta property="og:image:width" content="1080" />');
    expect(html).toContain(
      '<meta property="og:image:height" content="1350" />',
    );
  });

  it("escapes markup in item-supplied text", () => {
    const html = injectIntoShell(SHELL, {
      ...META,
      title: 'Scholarships & "grants" <script>alert(1)</script>',
    })!;

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes JSON-LD so it cannot break out of the script tag", () => {
    const html = injectIntoShell(SHELL, {
      ...META,
      jsonLd: { headline: "</script><script>alert(1)</script>" },
    })!;

    expect(html).toContain("\\u003c/script>");
    expect(html.match(/<script type="application\/ld\+json"/g)).toHaveLength(1);
  });

  it("refuses to inject twice, so a looped fetch cannot stack tags", () => {
    const once = injectIntoShell(SHELL, META)!;

    expect(once).toContain(OG_INJECTED_MARKER);
    expect(injectIntoShell(once, META)).toBeNull();
  });

  it("returns null for HTML that is not a usable shell", () => {
    expect(injectIntoShell("<h1>502 Bad Gateway</h1>", META)).toBeNull();
  });
});
