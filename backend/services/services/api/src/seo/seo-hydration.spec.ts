import { SeoHydrationController } from "./seo-hydration.controller";

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

function makeController() {
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
    findAll: jest.fn(
      async (limit: number, offset: number) =>
        opportunityRows.slice(offset, offset + limit),
    ),
  } as any;
  const shell = { get: jest.fn(async () => SHELL) } as any;

  return new SeoHydrationController(opportunities, shell);
}

describe("SEO hydration consistency", () => {
  it("serves canonical category pages through the bootable SPA shell", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunityCategory(
      "scholarships",
      "1",
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(html).toContain('<script type="module" src="/assets/index.js">');
    expect(html).toContain(
      '<link rel="canonical" href="https://www.edutu.org/opportunities/scholarships" />',
    );
    expect(response.headers["x-seo-source"]).toBe("backend/seo-shell");
  });

  it("uses a distinct title and canonical URL for later category pages", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunityCategory(
      "scholarships",
      "2",
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(html).toContain(
      "Scholarships for African and global students — Page 2 | Edutu",
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://www.edutu.org/opportunities/scholarships?page=2" />',
    );
  });

  it("returns a genuine noindex 404 for an unknown category", async () => {
    const controller = makeController();
    const response = makeResponse();

    const html = await controller.opportunityCategory(
      "made-up-category",
      "1",
      response,
    );

    expect(response.statusCode).toBe(404);
    expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(html).toContain("Opportunity category not found");
    expect(html).not.toContain('/assets/index.js');
  });
});
