import { SeoController } from "./seo.controller";

const SHELL = `<!doctype html><html lang="en"><head><title>Edutu</title><meta name="description" content="Generic"><link rel="canonical" href="https://www.edutu.org/"></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;

function makeResponse() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    headers,
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
    },
    removeHeader(key: string) {
      delete headers[key.toLowerCase()];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  } as any;
}

function makeController(overrides: Record<string, any> = {}) {
  const opportunityRows = Array.from({ length: 13 }, (_, index) => ({
    id: `opp-${index + 1}`,
    title: `Scholarship opportunity ${index + 1}`,
    summary: "Funding and mentorship for emerging African leaders.",
    category: "scholarships",
    organization: "Edutu Foundation",
    close_date: "2027-05-30",
    updated_at: "2026-08-20T00:00:00.000Z",
  }));
  const opportunities = {
    getPublicAppBaseUrl: jest.fn(() => "https://www.edutu.org"),
    findAll: jest.fn(async () => opportunityRows),
    findOne: jest.fn(async (id: string) =>
      id === "missing"
        ? null
        : {
            ...opportunityRows[0],
            id,
            description:
              "A verified scholarship supporting postgraduate study and leadership development.",
            eligibility_criteria:
              "Applicants must be citizens of an African country.",
            benefits: ["Tuition support", "Leadership mentoring"],
            requirements: ["Academic transcript", "Personal statement"],
            application_process: [
              "Review eligibility",
              "Submit the official application",
            ],
            application_url: "https://example.org/apply",
            source_url: "https://example.org/scholarship",
          },
    ),
    listSitemapOpportunities: jest.fn(async () => [
      {
        id: "opp-1",
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]),
    ...overrides.opportunities,
  };
  const blog = {
    findAll: jest.fn(async ({ offset = 0 }: { offset?: number }) =>
      offset > 0
        ? []
        : [
            {
              slug: "how-to-win-scholarships",
              title: "How to win scholarships",
              excerpt:
                "A practical guide to stronger scholarship applications.",
              status: "published",
              authorName: "Edutu Editorial Team",
              updatedAt: new Date("2026-08-19T00:00:00.000Z"),
              publishedAt: new Date("2026-08-18T00:00:00.000Z"),
            },
          ],
    ),
    peekBySlug: jest.fn(async (slug: string) =>
      slug === "missing"
        ? null
        : {
            slug,
            title: "How to win scholarships",
            excerpt: "A practical guide to stronger scholarship applications.",
            content:
              "Start early. Read the eligibility rules. Build evidence for every claim.",
            status: "published",
            authorName: "Edutu Editorial Team",
            publishedAt: new Date("2026-08-18T00:00:00.000Z"),
          },
    ),
    ...overrides.blog,
  };
  const events = {
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    ...overrides.events,
  };
  const shell = {
    get: jest.fn(async () => SHELL),
    ...overrides.shell,
  };

  return new SeoController(opportunities, blog, events, shell);
}

describe("SeoController", () => {
  it("publishes a sitemap index with one child sitemap per content family", () => {
    const controller = makeController();
    const response = makeResponse();

    const xml = controller.sitemapIndex(response);

    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("/sitemaps/pages.xml");
    expect(xml).toContain("/sitemaps/blog.xml");
    expect(xml).toContain("/sitemaps/opportunities.xml");
    expect(xml).toContain("/sitemaps/events.xml");
    expect(response.headers["content-type"]).toContain("application/xml");
  });

  it("publishes canonical category paths and dynamic opportunity URLs", async () => {
    const controller = makeController();
    const pages = controller.pagesSitemap(makeResponse());
    const opportunities = await controller.opportunitiesSitemap(makeResponse());

    expect(pages).toContain("/opportunities/scholarships");
    expect(pages).toContain("/opportunities/graduate-programs");
    expect(opportunities).toContain("/opportunity/opp-1");
  });

  it("renders crawlable opportunity archive links and URL-based pagination", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunitiesArchive(
      undefined,
      "1",
      response,
    );

    expect(html).toContain('href="/opportunity/opp-1"');
    expect(html).toContain('href="/opportunities?page=2"');
    expect(html).toContain('href="/opportunities/scholarships"');
    expect(html).toContain('<script type="module" src="/assets/index.js">');
  });

  it("renders original opportunity value before JavaScript runs", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunity("opp-1", response);

    expect(html).toContain("Applicants must be citizens of an African country");
    expect(html).toContain("Tuition support");
    expect(html).toContain("Academic transcript");
    expect(html).toContain("Source and verification");
    expect(html).toContain('href="https://example.org/scholarship"');
  });

  it("returns a real 404 and noindex for missing opportunities", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunity("missing", response);

    expect(response.statusCode).toBe(404);
    expect(html).toContain('name="robots" content="noindex, follow"');
    expect(html).toContain("Opportunity not found");
  });

  it("renders blog archive links and returns 404 for missing posts", async () => {
    const controller = makeController();
    const archive = await controller.blogArchive("1", makeResponse());
    const response = makeResponse();
    const missing = await controller.blogPost("missing", response);

    expect(archive).toContain('href="/blog/how-to-win-scholarships"');
    expect(response.statusCode).toBe(404);
    expect(missing).toContain('name="robots" content="noindex, follow"');
  });
});
