import { ServiceUnavailableException } from "@nestjs/common";
import { SeoCatalogService } from "./seo-catalog.service";

const BLOG_ROWS = [
  {
    id: "post-1",
    title: "Guide one",
    slug: "guide-one",
    excerpt: "First guide",
    content: "<p>First guide</p>",
    status: "published",
    authorName: "Edutu",
    coverImage: null,
    category: "Scholarships",
    tags: ["applications"],
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  },
  {
    id: "post-2",
    title: "Guide two",
    slug: "guide-two",
    excerpt: "Second guide",
    content: "<p>Second guide</p>",
    status: "published",
    authorName: "Edutu",
    coverImage: null,
    category: "Careers",
    tags: [],
    publishedAt: new Date("2026-08-03T00:00:00.000Z"),
    updatedAt: new Date("2026-08-04T00:00:00.000Z"),
  },
  {
    id: "post-3",
    title: "Guide three",
    slug: "guide-three",
    excerpt: "Third guide",
    content: "<p>Third guide</p>",
    status: "published",
    authorName: "Edutu",
    coverImage: null,
    category: "Careers",
    tags: [],
    publishedAt: new Date("2026-08-05T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
  },
];

const OPPORTUNITY_ROWS = [
  {
    id: "opp-1",
    title: "Scholarship one",
    summary: "First scholarship",
    organization: "Foundation A",
    category: "scholarship",
    location: "Africa",
    deadline: "2027-01-10",
    benefits: ["Tuition"],
    eligibility_criteria: ["African citizen"],
    application_url: "https://example.org/apply-1",
    source_url: "https://example.org/source-1",
    image_url: "https://cdn.example.org/1.jpg",
    updated_at: "2026-08-20T00:00:00.000Z",
    quality_score: 99,
    metadata: { private: true },
  },
  {
    id: "opp-2",
    title: "Scholarship two",
    description: "Second scholarship",
    organization_name: "Foundation B",
    category: "scholarship",
    country: "Nigeria",
    application_deadline: "2027-02-10",
    funding_details: "Tuition; stipend",
    eligibility: "Undergraduate students",
    how_to_apply: "Create an account; submit documents",
    apply_url: "https://example.org/apply-2",
    canonical_url: "https://example.org/source-2",
    source_image_url: "https://cdn.example.org/2.jpg",
    updatedAt: "2026-08-21T00:00:00.000Z",
    verification_error: "private",
  },
  {
    id: "opp-3",
    title: "Scholarship three",
    summary: "Third scholarship",
    category: "scholarship",
  },
];

function makeService(options?: {
  blogFindAll?: jest.Mock;
  blogPeek?: jest.Mock;
  opportunityFindAll?: jest.Mock;
  opportunityFindOne?: jest.Mock;
}) {
  const blog = {
    findAll:
      options?.blogFindAll ??
      jest.fn().mockResolvedValue(BLOG_ROWS.slice(0, 3)),
    peekBySlug: options?.blogPeek ?? jest.fn().mockResolvedValue(BLOG_ROWS[0]),
  } as any;
  const opportunities = {
    findAll:
      options?.opportunityFindAll ??
      jest.fn().mockResolvedValue(OPPORTUNITY_ROWS.slice(0, 3)),
    findOne:
      options?.opportunityFindOne ??
      jest.fn().mockResolvedValue(OPPORTUNITY_ROWS[0]),
    getPublicAppBaseUrl: () => "https://edutu.org/",
  } as any;

  return {
    service: new SeoCatalogService(blog, opportunities),
    blog,
    opportunities,
  };
}

describe("SeoCatalogService archives", () => {
  it("uses a one-extra-row query to detect the next blog page", async () => {
    const { service, blog } = makeService();
    const page = await service.getBlogPage(2, 2);

    expect(blog.findAll).toHaveBeenCalledWith({
      status: "published",
      limit: 3,
      offset: 2,
    });
    expect(page).toMatchObject({
      page: 2,
      pageSize: 2,
      hasNext: true,
      totalPages: 3,
    });
    expect(page.items).toHaveLength(2);
  });

  it("maps public SEO categories to the existing opportunity vocabulary", async () => {
    const { service, opportunities } = makeService();
    const page = await service.getOpportunityPage(1, 2, "scholarships");

    expect(opportunities.findAll).toHaveBeenCalledWith(
      3,
      0,
      "active",
      "scholarship",
    );
    expect(page.category).toBe("scholarships");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).not.toHaveProperty("quality_score");
    expect(page.items[0]).not.toHaveProperty("metadata");
  });

  it("clamps invalid page and page-size values", async () => {
    const { service, blog } = makeService();
    const page = await service.getBlogPage(-4, 500);

    expect(blog.findAll).toHaveBeenCalledWith({
      status: "published",
      limit: 51,
      offset: 0,
    });
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
  });

  it("returns null for an unavailable public item without fabricating content", async () => {
    const { service } = makeService({
      blogPeek: jest.fn().mockResolvedValue(null),
      opportunityFindOne: jest.fn().mockResolvedValue(null),
    });

    await expect(service.getBlogPost("missing")).resolves.toBeNull();
    await expect(service.getOpportunity("missing")).resolves.toBeNull();
  });
});

describe("SeoCatalogService sitemap inventory", () => {
  it("deduplicates blog slugs and opportunity ids across bounded batches", async () => {
    const blogFindAll = jest
      .fn()
      .mockResolvedValueOnce([BLOG_ROWS[0], BLOG_ROWS[1], BLOG_ROWS[0]])
      .mockResolvedValueOnce([]);
    const opportunityFindAll = jest
      .fn()
      .mockResolvedValueOnce([
        OPPORTUNITY_ROWS[0],
        OPPORTUNITY_ROWS[1],
        OPPORTUNITY_ROWS[0],
      ])
      .mockResolvedValueOnce([]);
    const { service } = makeService({ blogFindAll, opportunityFindAll });

    const inventory = await service.getSitemapInventory({ batchSize: 3 });

    expect(inventory.blogPosts.map((post) => post.slug)).toEqual([
      "guide-one",
      "guide-two",
    ]);
    expect(
      inventory.opportunities.map((opportunity) => opportunity.id),
    ).toEqual(["opp-1", "opp-2"]);
    expect(inventory.generatedAt).toBeInstanceOf(Date);
  });

  it("propagates database failures so controllers can return 503", async () => {
    const failure = new ServiceUnavailableException("database unavailable");
    const { service } = makeService({
      blogFindAll: jest.fn().mockRejectedValue(failure),
    });

    await expect(service.getSitemapInventory()).rejects.toBe(failure);
  });

  it("canonicalizes the public site origin", () => {
    const { service } = makeService();
    expect(service.getSiteUrl()).toBe("https://www.edutu.org");
  });
});
