import { EdutuApiDocsController } from "./edutu-api-docs.controller";

describe("EdutuApiDocsController", () => {
  let controller: EdutuApiDocsController;

  beforeEach(() => {
    controller = new EdutuApiDocsController();
  });

  it("returns a public OpenAPI document for the Scholarship Engine API", () => {
    const spec = controller.getOpenApiDocument() as any;

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Scholarship Engine Public API");
    expect(spec.servers[0].url).toMatch(/\/v1$/);
    expect(spec.paths["/health"].get.security).toEqual([]);
    expect(spec.paths["/opportunities"]).toBeDefined();
    expect(spec.paths["/opportunities/{id}"]).toBeDefined();
    expect(spec.paths["/categories"]).toBeDefined();
    expect(spec.paths["/usage"]).toBeDefined();
    expect(spec.components.securitySchemes.apiKeyAuth).toBeDefined();
    expect(spec.components.securitySchemes.clerkAuth).toBeDefined();
    expect(spec.components.schemas.Opportunity).toBeDefined();
    expect(spec.info.description).toContain("/developer/*");
    expect(spec.info.description).toContain("402");
    expect(spec.info.description).toContain("non-expiring");
    expect(spec.paths["/health"].get.security).toEqual([]);
    expect(spec.paths["/categories"].get.description).toContain("free");
    expect(spec.paths["/usage"].get.description).toContain("does not consume");
    expect(spec.paths["/opportunities"].get.responses["402"].description).toContain(
      "credits_exhausted",
    );
    expect(spec["x-edutu-contract"].credits.exhausted).toEqual({
      status: 402,
      code: "credits_exhausted",
      operationExecuted: false,
    });
    expect(spec.paths["/match"]).toBeUndefined();
    expect(spec.paths["/scraper/run"]).toBeUndefined();
    expect(spec.paths["/keys"]).toBeUndefined();
  });

  it("returns a public discovery overview for the Scholarship Engine API", () => {
    const overview = controller.getApiOverview() as any;

    expect(overview.name).toBe("Scholarship Engine Public API");
    expect(overview.service).toBe("edutu-api");
    expect(overview.status).toBe("ok");
    expect(overview.openapiUrl).toMatch(/\/openapi\.json$/);
    expect(overview.authentication.developerRoutes.scheme).toBe("Clerk user session");
    expect(overview.authentication.apiRoutes.scheme).toBe("Edutu API key");
    expect(overview.credits.startingBalance).toBe(0);
    expect(overview.credits.topUps).toBe("one-time");
    expect(overview.credits.expiry).toBe("never");
    expect(overview.credits.freeEndpoints).toEqual([
      "GET /v1/health",
      "GET /v1/usage",
      "GET /v1/categories",
    ]);
    expect(overview.credits.chargeableRequestCost).toBe(1);
    expect(overview.dashboardUrl).toContain("/dashboard/developer");
    expect(
      overview.endpoints.some(
        (item: { path: string }) => item.path === "/v1/usage",
      ),
    ).toBe(true);
  });

  it("serves an AI-ready llms.txt document grounded in the configured base URL", () => {
    const previous = process.env.EDUTU_API_PUBLIC_URL;
    process.env.EDUTU_API_PUBLIC_URL = "https://api.example.com/v1";

    try {
      const doc = controller.getLlmsDocument();

      expect(doc).toContain("# Edutu Scholarship Engine API");
      expect(doc).toContain("Base URL: https://api.example.com/v1");
      expect(doc).toContain("x-edutu-api-key");
      expect(doc).toContain("POST | /recommendations");
      expect(doc).toContain("Clerk");
      expect(doc).toContain("New accounts start with **0 credits**");
      expect(doc).toContain("one-time purchases");
      expect(doc).toContain("402 `credits_exhausted`");
      expect(doc).toContain('"code":"credits_exhausted"');
      expect(doc).toContain("server-to-server");
      expect(doc).not.toContain("/v1/match");
      expect(doc).not.toContain("/v1/scraper/run");
      expect(doc).not.toContain("/v1/keys");
      expect(doc).toContain("code=rate_limit_exceeded");
      expect(doc).toContain(
        'curl "https://api.example.com/v1/opportunities?limit=5"',
      );
    } finally {
      if (previous === undefined) delete process.env.EDUTU_API_PUBLIC_URL;
      else process.env.EDUTU_API_PUBLIC_URL = previous;
    }
  });

  it("respects an explicit openapi url override", () => {
    const previous = process.env.EDUTU_API_OPENAPI_URL;
    process.env.EDUTU_API_OPENAPI_URL =
      "https://api.example.com/spec/openapi.json";

    try {
      const spec = controller.getOpenApiDocument() as any;
      const overview = controller.getApiOverview() as any;

      expect(spec.servers[1].url).toBe("https://api.example.com/spec");
      expect(overview.openapiUrl).toBe(
        "https://api.example.com/spec/openapi.json",
      );
    } finally {
      if (previous === undefined) delete process.env.EDUTU_API_OPENAPI_URL;
      else process.env.EDUTU_API_OPENAPI_URL = previous;
    }
  });
});
