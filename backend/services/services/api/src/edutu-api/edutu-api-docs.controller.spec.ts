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
    expect(spec.components.schemas.Opportunity).toBeDefined();
  });

  it("returns a public discovery overview for the Scholarship Engine API", () => {
    const overview = controller.getApiOverview() as any;

    expect(overview.name).toBe("Scholarship Engine Public API");
    expect(overview.service).toBe("edutu-api");
    expect(overview.status).toBe("ok");
    expect(overview.openapiUrl).toMatch(/\/openapi\.json$/);
    expect(
      overview.endpoints.some(
        (item: { path: string }) => item.path === "/v1/usage",
      ),
    ).toBe(true);
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
