import {
  injectSeoIntoShell,
  renderSeoDocument,
  type SeoPageDocument,
} from "./seo-render";

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Edutu</title>
    <meta name="description" content="Generic shell" />
    <link rel="canonical" href="https://www.edutu.org/" />
    <meta property="og:image" content="https://www.edutu.org/og/home.jpg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const PAGE: SeoPageDocument = {
  title: "Scholarships for African students | Edutu",
  description: "Verified scholarship opportunities, deadlines and application guidance.",
  canonicalUrl: "https://www.edutu.org/opportunities/scholarships",
  imageUrl: "https://www.edutu.org/og/opportunities.jpg",
  imageAlt: "Scholarships on Edutu",
  ogType: "website",
  robots: "index, follow, max-image-preview:large",
  bodyHtml:
    '<main id="seo-content"><h1>Scholarships</h1><article><a href="/opportunity/opp-1">Opportunity one</a></article></main>',
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Scholarships",
  },
};

describe("SEO document rendering", () => {
  it("injects semantic content without removing the SPA entry script", () => {
    const html = injectSeoIntoShell(SHELL, PAGE);

    expect(html).not.toBeNull();
    expect(html).toContain('<script type="module" src="/assets/index.js">');
    expect(html).toContain('<div id="root"><main id="seo-content">');
    expect(html).toContain('href="/opportunity/opp-1"');
    expect(html).toContain(
      '<link rel="canonical" href="https://www.edutu.org/opportunities/scholarships" />',
    );
    expect(html!.match(/name="description"/g)).toHaveLength(1);
    expect(html!.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("honours noindex for missing or invalid resources", () => {
    const html = injectSeoIntoShell(SHELL, {
      ...PAGE,
      robots: "noindex, follow",
    })!;

    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("renders a responsive standalone document when no SPA shell is available", () => {
    const html = renderSeoDocument(PAGE);

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    expect(html).toContain("@media (max-width: 640px)");
    expect(html).toContain('<main id="seo-content">');
    expect(html).toContain('type="application/ld+json"');
  });

  it("refuses invalid shells and prevents repeated injection", () => {
    expect(injectSeoIntoShell("<h1>Bad gateway</h1>", PAGE)).toBeNull();
    const once = injectSeoIntoShell(SHELL, PAGE)!;
    expect(injectSeoIntoShell(once, PAGE)).toBeNull();
  });
});
