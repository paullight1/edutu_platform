import type { OgPageMeta } from "../og/og-page.render";
import {
  renderBlogArchiveBody,
  renderOpportunityBody,
  renderPagination,
  renderRobots,
  renderSeoPage,
  renderSitemap,
  type PublicBlogPost,
  type PublicOpportunity,
} from "./seo-page.render";

const SPA_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Edutu</title>
    <meta name="description" content="Generic" />
    <link rel="canonical" href="https://www.edutu.org/" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const META: OgPageMeta = {
  title: "Scholarship guides | Edutu",
  description: "Practical scholarship guidance for African students.",
  image: "https://www.edutu.org/og/blog.jpg",
  imageAlt: "Edutu scholarship guides",
  url: "https://www.edutu.org/blog?page=2",
  ogType: "website",
  ctaLabel: "Read scholarship guides",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Scholarship guides",
  },
};

const BLOG_POSTS: PublicBlogPost[] = [
  {
    id: "post-1",
    title: "How to win a fully funded scholarship",
    slug: "win-a-fully-funded-scholarship",
    excerpt: "A practical application guide.",
    content: "<p>Detailed guide</p>",
    authorName: "Edutu Editorial",
    coverImage: null,
    category: "Scholarships",
    tags: ["applications"],
    publishedAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
];

const OPPORTUNITY: PublicOpportunity = {
  id: "opp-1",
  title: "Mandela Rhodes Scholarship 2027",
  summary: "Fully funded postgraduate scholarship for young Africans.",
  description: "Study, lead, and build a network across Africa.",
  organization: "Mandela Rhodes Foundation",
  category: "Scholarship",
  location: "South Africa",
  deadline: "2027-04-30",
  benefits: ["Tuition", "Living allowance"],
  eligibility: ["African citizen", "Aged 19 to 29"],
  applicationProcess: ["Create an account", "Submit references"],
  applicationUrl: "https://example.org/apply",
  sourceUrl: "https://example.org/scholarship",
  imageUrl: "https://cdn.example.org/flyer.jpg",
  updatedAt: "2026-08-20T10:00:00.000Z",
};

describe("SEO page renderer", () => {
  it("injects real crawlable copy into the SPA shell without removing its assets", () => {
    const html = renderSeoPage({
      shell: SPA_SHELL,
      meta: META,
      bodyHtml: '<main id="seo-content"><h1>Real scholarship copy</h1></main>',
    });

    expect(html).toContain("Real scholarship copy");
    expect(html).toContain('<script type="module" src="/assets/index.js">');
    expect(html).toContain(
      '<link rel="canonical" href="https://www.edutu.org/blog?page=2"',
    );
    expect(html).toContain('type="application/ld+json"');
  });

  it("renders a responsive standalone document when the SPA shell is unavailable", () => {
    const html = renderSeoPage({
      shell: null,
      meta: META,
      bodyHtml: "<main><h1>Fallback content</h1></main>",
    });

    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("max-width:100%");
    expect(html).toContain("Fallback content");
    expect(html).toContain("https://www.edutu.org/blog?page=2");
  });

  it("can mark an error document noindex without losing follow links", () => {
    const html = renderSeoPage({
      shell: null,
      meta: META,
      bodyHtml: '<main><a href="/blog">Back to blog</a></main>',
      robots: "noindex, follow",
    });

    expect(html).toContain('<meta name="robots" content="noindex, follow"');
    expect(html).toContain('href="/blog"');
  });
});

describe("crawlable pagination", () => {
  it("renders numbered, previous, and next pages as real anchors", () => {
    const html = renderPagination({
      basePath: "/blog",
      page: 2,
      totalPages: 4,
      searchParams: new URLSearchParams("topic=ai"),
    });

    expect(html).toContain('href="/blog?topic=ai"');
    expect(html).toContain('href="/blog?topic=ai&amp;page=3"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Next page"');
  });

  it("omits unusable navigation for a single page", () => {
    expect(
      renderPagination({ basePath: "/blog", page: 1, totalPages: 1 }),
    ).toBe("");
  });
});

describe("archive and detail content", () => {
  it("renders blog archive cards with crawlable post links and semantic dates", () => {
    const html = renderBlogArchiveBody({
      posts: BLOG_POSTS,
      page: 1,
      totalPages: 2,
      basePath: "/blog",
    });

    expect(html).toContain("<main");
    expect(html).toContain("<article");
    expect(html).toContain(
      'href="/blog/win-a-fully-funded-scholarship"',
    );
    expect(html).toContain('<time datetime="2026-08-01T10:00:00.000Z"');
    expect(html).toContain('href="/blog?page=2"');
  });

  it("escapes opportunity data and omits empty or unsafe values", () => {
    const html = renderOpportunityBody({
      ...OPPORTUNITY,
      title: '<script>alert("x")</script> Scholarship',
      applicationUrl: "javascript:alert(1)",
      sourceUrl: "data:text/html,bad",
      benefits: ["Tuition", '<img src=x onerror="alert(1)">'],
    });

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("Eligibility");
    expect(html).toContain("How to apply");
    expect(html).toContain("Last reviewed");
  });

  it("omits opportunity sections that have no source data", () => {
    const html = renderOpportunityBody({
      id: "minimal",
      title: "Minimal opportunity",
    });

    expect(html).not.toContain("Eligibility</h2>");
    expect(html).not.toContain("Benefits</h2>");
    expect(html).not.toContain("How to apply</h2>");
  });
});

describe("sitemap and robots rendering", () => {
  it("renders valid escaped XML with canonical URLs and lastmod", () => {
    const xml = renderSitemap([
      {
        loc: "https://www.edutu.org/blog?topic=ai&level=beginner",
        lastmod: "2026-08-23T12:30:00.000Z",
      },
    ]);

    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      "https://www.edutu.org/blog?topic=ai&amp;level=beginner",
    );
    expect(xml).toContain("<lastmod>2026-08-23</lastmod>");
  });

  it("renders a robots file that protects authenticated surfaces", () => {
    const robots = renderRobots("https://www.edutu.org/");

    expect(robots).toContain("Disallow: /app/");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain(
      "Sitemap: https://www.edutu.org/sitemap.xml",
    );
  });
});
