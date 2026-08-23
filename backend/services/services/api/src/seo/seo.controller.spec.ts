import { ServiceUnavailableException } from "@nestjs/common";
import { SeoController } from "./seo.controller";
import type { SeoInventory } from "./seo-catalog.service";

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

const BLOG_POST = {
  id: "post-1",
  title: "How to win a fully funded scholarship",
  slug: "win-a-fully-funded-scholarship",
  excerpt: "A practical guide for applicants.",
  content: "Prepare early, research the funder, and submit evidence.",
  authorName: "Edutu Editorial",
  coverImage: "https://cdn.example.org/blog.jpg",
  category: "Scholarships",
  tags: ["applications"],
  publishedAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const OPPORTUNITY = {
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
  sourceUrl: "https://example.org/source",
  imageUrl: "https://cdn.example.org/flyer.jpg",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

function makeRes() {
  const headers: Record<string, string> = {
    "content-security-policy": "default-src 'self'",
  };
  const response = {
    statusCode: 200,
    headers,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    setHeader(key: string, value: string | number) {
      headers[key.toLowerCase()] = String(value);
      return response;
    },
    removeHeader(key: string) {
      delete headers[key.toLowerCase()];
    },
  };
  return response as any;
}

function makeController(overrides?: Record<string, jest.Mock>) {
  const catalog = {
    getSiteUrl: () => "https://www.edutu.org",
    isCategory: (value: string) =>
      ["scholarships", "internships", "fellowships", "programs"].includes(
        value,
      ),
    getBlogPage: jest.fn().mockResolvedValue({
      items: [BLOG_POST],
      page: 2,
      pageSize: 12,
      hasNext: true,
      totalPages: 3,
    }),
    getBlogPost: jest.fn().mockResolvedValue(BLOG_POST),
    getOpportunityPage: jest.fn().mockResolvedValue({
      items: [OPPORTUNITY],
      page: 1,
      pageSize: 24,
      hasNext: true,
      totalPages: 2,
      category: null,
    }),
    getOpportunity: jest.fn().mockResolvedValue(OPPORTUNITY),
    getSitemapInventory: jest.fn().mockResolvedValue({
      blogPosts: [BLOG_POST],
      opportunities: [OPPORTUNITY],
      generatedAt: new Date("2026-08-23T12:00:00.000Z"),
    } satisfies SeoInventory),
    ...overrides,
  } as any;
  const shell = {
    get: jest.fn().mockResolvedValue(SPA_SHELL),
  } as any;

  return {
    controller: new SeoController(catalog, shell),
    catalog,
    shell,
  };
}

describe("SeoController public archives", () => {
  it("serves a page-addressable blog archive with real article anchors", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const html = await controller.blogArchive("2", res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(html).toContain(
      'href="/blog/win-a-fully-funded-scholarship"',
    );
    expect(html).toContain('href="/blog?page=3"');
    expect(html).toContain(
      'rel="canonical" href="https://www.edutu.org/blog?page=2"',
    );
    expect(html).toContain('/assets/index.js');
  });

  it("serves a category-specific standalone opportunity hub", async () => {
    const { controller, catalog } = makeController();
    const res = makeRes();
    const html = await controller.opportunityCategory(
      "scholarships",
      "1",
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(catalog.getOpportunityPage).toHaveBeenCalledWith(
      1,
      24,
      "scholarships",
    );
    expect(html).toContain("Scholarships for African students");
    expect(html).toContain(
      'rel="canonical" href="https://www.edutu.org/opportunities/scholarships"',
    );
    expect(html).not.toContain('/assets/index.js');
  });
});

describe("SeoController public detail pages", () => {
  it("serves complete crawler-visible opportunity content and structured data", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const html = await controller.opportunity("opp-1", res);

    expect(res.statusCode).toBe(200);
    expect(html).toContain("Mandela Rhodes Scholarship 2027");
    expect(html).toContain("Eligibility");
    expect(html).toContain("Living allowance");
    expect(html).toContain("How to apply");
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('/assets/index.js');
  });

  it("returns a real 404 and noindex header for an unknown opportunity", async () => {
    const { controller } = makeController({
      getOpportunity: jest.fn().mockResolvedValue(null),
    });
    const res = makeRes();
    const html = await controller.opportunity("missing", res);

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-robots-tag"]).toBe("noindex, follow");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(html).toContain("Opportunity not found");
    expect(html).toContain('href="/opportunities"');
  });

  it("canonicalizes the share route to the primary opportunity and keeps it noindex", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const html = await controller.shareOpportunity("opp-1", res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex, follow");
    expect(html).toContain(
      'rel="canonical" href="https://www.edutu.org/opportunity/opp-1"',
    );
  });

  it("returns 503 with Retry-After instead of an empty successful page", async () => {
    const { controller } = makeController({
      getBlogPage: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException("database unavailable"),
        ),
    });
    const res = makeRes();
    const html = await controller.blogArchive("1", res);

    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("300");
    expect(res.headers["x-robots-tag"]).toBe("noindex, follow");
    expect(html).toContain("temporarily unavailable");
  });
});

describe("SeoController discovery files", () => {
  it("serves a live sitemap with dynamic inventory and diagnostic counts", async () => {
    const { controller } = makeController();
    const res = makeRes();
    const xml = await controller.sitemap(res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.headers["x-edutu-seo-inventory"]).toBe(
      "blog=1;opportunities=1",
    );
    expect(xml).toContain(
      "https://www.edutu.org/blog/win-a-fully-funded-scholarship",
    );
    expect(xml).toContain("https://www.edutu.org/opportunity/opp-1");
    expect(xml).toContain(
      "https://www.edutu.org/opportunities/scholarships",
    );
  });

  it("serves robots.txt with the canonical sitemap", () => {
    const { controller } = makeController();
    const res = makeRes();
    const robots = controller.robots(res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(robots).toContain(
      "Sitemap: https://www.edutu.org/sitemap.xml",
    );
  });
});
