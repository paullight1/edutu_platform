import { EdutuApiDocsController } from "./edutu-api-docs.controller";

const EXPECTED_LIVE_OPERATIONS = [
  {
    method: "GET",
    overviewPath: "/v1/health",
    openapiPath: "/health",
    access: "public, free",
    scope: null,
    billing: "free",
    stableBillingErrors: [],
  },
  {
    method: "GET",
    overviewPath: "/v1/opportunities",
    openapiPath: "/opportunities",
    access: "api key",
    scope: "opportunities:read",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
  {
    method: "GET",
    overviewPath: "/v1/opportunities/stats",
    openapiPath: "/opportunities/stats",
    access: "api key",
    scope: "opportunities:read",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
  {
    method: "GET",
    overviewPath: "/v1/opportunities/sync",
    openapiPath: "/opportunities/sync",
    access: "api key",
    scope: "opportunities:sync",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
  {
    method: "GET",
    overviewPath: "/v1/opportunities/:id",
    openapiPath: "/opportunities/{id}",
    access: "api key",
    scope: "opportunities:read",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
  {
    method: "GET",
    overviewPath: "/v1/categories",
    openapiPath: "/categories",
    access: "api key, free",
    scope: "opportunities:read",
    billing: "free",
    stableBillingErrors: [],
  },
  {
    method: "GET",
    overviewPath: "/v1/usage",
    openapiPath: "/usage",
    access: "api key, free",
    scope: "usage:read",
    billing: "free",
    stableBillingErrors: [],
  },
  {
    method: "POST",
    overviewPath: "/v1/recommendations",
    openapiPath: "/recommendations",
    access: "api key",
    scope: "recommendations:read",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
  {
    method: "POST",
    overviewPath: "/v1/events",
    openapiPath: "/events",
    access: "api key",
    scope: "events:write",
    billing: "chargeable",
    stableBillingErrors: ["402", "503"],
  },
] as const;

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
    expect(spec.components.responses.BillingUnavailable).toBeDefined();
    expect(spec.components.schemas.Opportunity).toBeDefined();
    expect(spec.info.description).toContain("/developer/*");
    expect(spec.info.description).toContain("402");
    expect(spec.info.description).toContain("non-expiring");
    expect(spec.paths["/health"].get.security).toEqual([]);
    expect(spec.paths["/categories"].get.description).toContain("free");
    expect(spec.paths["/usage"].get.description).toContain("does not consume");
    expect(spec.components.parameters.OpportunityCursor.description).toContain(
      "meta.nextCursor",
    );
    expect(
      spec.components.parameters.OpportunityCursor.description,
    ).not.toContain("next_cursor");
    expect(spec["x-edutu-contract"].requiredScopes).toEqual({
      "opportunities:read": [
        "GET /v1/opportunities",
        "GET /v1/opportunities/stats",
        "GET /v1/opportunities/:id",
        "GET /v1/categories",
      ],
      "opportunities:sync": ["GET /v1/opportunities/sync"],
      "usage:read": ["GET /v1/usage"],
      "recommendations:read": ["POST /v1/recommendations"],
      "events:write": ["POST /v1/events"],
    });
    expect(spec["x-edutu-contract"].opportunityVisibility).toContain(
      "pending_review/unverified",
    );
    expect(spec["x-edutu-contract"].opportunityVisibility).toContain(
      "active/verified",
    );
    expect(spec.components.schemas.Opportunity.properties).toHaveProperty(
      "eligibilityCriteria",
    );
    expect(spec.components.schemas.Opportunity.properties).toHaveProperty(
      "imageUrl",
    );
    expect(spec.components.schemas.Opportunity.properties).toHaveProperty(
      "trust",
    );
    expect(spec.components.schemas.Opportunity.properties).not.toHaveProperty(
      "organization",
    );
    expect(
      spec.paths["/opportunities"].get.responses["402"].description,
    ).toContain("credits_exhausted");
    expect(spec.components.responses.BillingUnavailable.description).toContain(
      "billing_unavailable",
    );
    expect(
      spec.components.responses.BillingUnavailable.content["application/json"]
        .example,
    ).toMatchObject({
      error: { status: 503, code: "billing_unavailable" },
    });
    expect(spec["x-edutu-contract"].credits.billingUnavailable).toEqual({
      status: 503,
      code: "billing_unavailable",
      operationExecuted: false,
    });

    const overview = controller.getApiOverview() as any;
    expect(
      overview.endpoints
        .map(({ method, path, access }: any) => ({ method, path, access }))
        .sort((left: any, right: any) => left.path.localeCompare(right.path)),
    ).toEqual(
      EXPECTED_LIVE_OPERATIONS.map(({ method, overviewPath, access }) => ({
        method,
        path: overviewPath,
        access,
      })).sort((left, right) => left.path.localeCompare(right.path)),
    );

    const openapiOperations = Object.entries(spec.paths).flatMap(
      ([path, pathItem]: [string, any]) =>
        Object.keys(pathItem)
          .filter((method) => ["get", "post"].includes(method))
          .map((method) => ({ method: method.toUpperCase(), path })),
    );
    expect(openapiOperations).toEqual(
      EXPECTED_LIVE_OPERATIONS.map(({ method, openapiPath }) => ({
        method,
        path: openapiPath,
      })),
    );

    for (const operation of EXPECTED_LIVE_OPERATIONS) {
      const pathItem = spec.paths[operation.openapiPath];
      const operationDocument = pathItem[operation.method.toLowerCase()];
      expect(operationDocument).toBeDefined();
      if (operation.billing !== "free" || operation.openapiPath !== "/health") {
        expect(JSON.stringify(operationDocument)).toContain(operation.billing);
      }
      if (operation.scope) {
        expect(
          spec["x-edutu-contract"].requiredScopes[operation.scope],
        ).toContain(`${operation.method} ${operation.overviewPath}`);
      }
      for (const status of operation.stableBillingErrors) {
        expect(operationDocument.responses[status]).toBeDefined();
      }
      if (operation.billing === "free") {
        expect(operationDocument.responses["402"]).toBeUndefined();
        expect(operationDocument.responses["503"]).toBeUndefined();
      }
    }

    const contractText = JSON.stringify(spec);
    for (const staleExample of [
      "edutu_test_",
      "edutu_live_",
      "sk_live_edutu",
    ]) {
      expect(contractText).not.toContain(staleExample);
    }
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
    expect(overview.authentication.developerRoutes.scheme).toBe(
      "Clerk user session",
    );
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
    expect(overview.requiredScopes["opportunities:sync"]).toEqual([
      "GET /v1/opportunities/sync",
    ]);
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
      expect(doc).toContain("peppered HMAC-SHA256");
      expect(doc).toContain("legacy SHA-256");
      expect(doc).toContain("opportunities:sync");
      expect(doc).toContain("usage:read");
      expect(doc).toContain("meta.nextCursor");
      expect(doc).not.toContain("next_cursor");
      expect(doc).toContain("pending_review");
      expect(doc).toContain("active");
      expect(doc).toContain("402 `credits_exhausted`");
      expect(doc).toContain("503 `billing_unavailable`");
      expect(doc).toContain('"code":"credits_exhausted"');
      expect(doc).toContain(
        "do not consume credits but still consume the applicable rate-limit and monthly-quota allowance",
      );
      expect(doc).toContain("server-to-server");
      expect(doc).not.toContain("/v1/match");
      expect(doc).not.toContain("/v1/scraper/run");
      expect(doc).not.toContain("/v1/keys");
      expect(doc).toContain("code=rate_limit_exceeded");
      expect(doc).toContain(
        'curl "https://api.example.com/v1/opportunities?limit=5"',
      );
      for (const staleExample of [
        "edutu_test_",
        "edutu_live_",
        "sk_live_edutu",
      ]) {
        expect(doc).not.toContain(staleExample);
      }
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
