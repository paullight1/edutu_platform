import { Controller, Get } from "@nestjs/common";
import { getConfiguredEngineApiKeys } from "../auth/api-key.guard.js";
import { Public } from "../auth/public.decorator.js";

const DEFAULT_MARKETING_URL = "https://www.edutu.org/scholarship-engine";
const DEFAULT_DASHBOARD_URL = "https://www.edutu.org/developers";
const DEFAULT_DOCS_URL = "https://docs.edutu.org";

@Public()
@Controller(["", "v1"])
export class DiscoveryController {
  @Get()
  getApiOverview() {
    const urls = this.getServiceUrls();

    return {
      name: "Scholarship Engine API",
      service: "edutuengineapi",
      version: "0.1.0",
      status: "ok",
      docsUrl: process.env.EDUTU_ENGINE_DOCS_URL || DEFAULT_DOCS_URL,
      dashboardUrl:
        process.env.EDUTU_ENGINE_DASHBOARD_URL || DEFAULT_DASHBOARD_URL,
      marketingUrl:
        process.env.EDUTU_ENGINE_MARKETING_URL || DEFAULT_MARKETING_URL,
      apiBaseUrl: urls.apiBaseUrl,
      openapiUrl: urls.openapiUrl,
      authentication: {
        required: true,
        acceptedHeaders: [
          "x-api-key: <api_key>",
          "Authorization: Bearer <api_key>",
        ],
        apiKeysConfigured: getConfiguredEngineApiKeys().length > 0,
      },
      quickstart: [
        "Create or configure an API key in EDUTU_ENGINE_API_KEYS.",
        "Call GET /health or GET /v1/health to confirm the service is running.",
        "Inspect GET /v1/openapi.json for the machine-readable contract.",
        "Use POST /v1/extract/url to enrich a single opportunity page.",
        "Use POST /v1/scrape/run to crawl a public source page.",
      ],
      endpoints: [
        {
          method: "GET",
          path: "/health",
          access: "public",
          description: "Runtime health and environment checks.",
        },
        {
          method: "GET",
          path: "/v1/health",
          access: "public",
          description: "Versioned runtime health and environment checks.",
        },
        {
          method: "GET",
          path: "/v1/openapi.json",
          access: "public",
          description: "Machine-readable OpenAPI contract for Scholarship Engine.",
        },
        {
          method: "POST",
          path: "/v1/extract/url",
          access: "api key",
          description:
            "Extract a normalized opportunity from one public detail page.",
        },
        {
          method: "POST",
          path: "/v1/scrape/run",
          access: "api key",
          description:
            "Discover and extract multiple opportunities from one source page.",
        },
      ],
    };
  }

  @Get("openapi.json")
  getOpenApiDocument() {
    const urls = this.getServiceUrls();
    const docsUrl = process.env.EDUTU_ENGINE_DOCS_URL || DEFAULT_DOCS_URL;
    const dashboardUrl =
      process.env.EDUTU_ENGINE_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
    const marketingUrl =
      process.env.EDUTU_ENGINE_MARKETING_URL || DEFAULT_MARKETING_URL;

    return {
      openapi: "3.1.0",
      info: {
        title: "Scholarship Engine API",
        version: "0.1.0",
        description:
          "Scholarship Engine is Edutu's public opportunity extraction API. Use it to enrich opportunity pages, crawl public sources, and power external developer integrations.",
        contact: {
          name: "Edutu",
          url: docsUrl,
        },
      },
      servers: [
        {
          url: urls.apiOriginUrl,
          description: "Primary service origin",
        },
      ],
      tags: [
        {
          name: "Discovery",
          description: "Public product information and documentation links.",
        },
        {
          name: "Health",
          description: "Runtime readiness and environment checks.",
        },
        {
          name: "Extraction",
          description: "Convert a single opportunity page into a normalized record.",
        },
        {
          name: "Scraping",
          description: "Discover and extract multiple opportunity records from a source page.",
        },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description: "Provide a valid Edutu Engine API key.",
          },
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "opaque api key",
            description: "Bearer token form of the same Edutu Engine API key.",
          },
        },
        schemas: {
          DiscoveryResponse: {
            type: "object",
            additionalProperties: false,
            required: [
              "name",
              "service",
              "version",
              "status",
              "docsUrl",
              "dashboardUrl",
              "marketingUrl",
              "apiBaseUrl",
              "openapiUrl",
              "authentication",
              "quickstart",
              "endpoints",
            ],
            properties: {
              name: { type: "string" },
              service: { type: "string" },
              version: { type: "string" },
              status: { type: "string" },
              docsUrl: { type: "string", format: "uri" },
              dashboardUrl: { type: "string", format: "uri" },
              marketingUrl: { type: "string", format: "uri" },
              apiBaseUrl: { type: "string", format: "uri" },
              openapiUrl: { type: "string", format: "uri" },
              authentication: {
                type: "object",
                additionalProperties: false,
                required: ["required", "acceptedHeaders", "apiKeysConfigured"],
                properties: {
                  required: { type: "boolean" },
                  acceptedHeaders: {
                    type: "array",
                    items: { type: "string" },
                  },
                  apiKeysConfigured: { type: "boolean" },
                },
              },
              quickstart: {
                type: "array",
                items: { type: "string" },
              },
              endpoints: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["method", "path", "access", "description"],
                  properties: {
                    method: { type: "string" },
                    path: { type: "string" },
                    access: { type: "string" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          HealthResponse: {
            type: "object",
            additionalProperties: false,
            required: ["status", "service", "version", "timestamp", "checks"],
            properties: {
              status: { type: "string" },
              service: { type: "string" },
              version: { type: "string" },
              timestamp: { type: "string", format: "date-time" },
              checks: {
                type: "object",
                additionalProperties: false,
                required: [
                  "apiKeysConfigured",
                  "deepseekConfigured",
                  "supabaseConfigured",
                ],
                properties: {
                  apiKeysConfigured: { type: "boolean" },
                  deepseekConfigured: { type: "boolean" },
                  supabaseConfigured: { type: "boolean" },
                },
              },
            },
          },
          ExtractOpportunityRequest: {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            properties: {
              url: { type: "string", format: "uri" },
              sourceUrl: { type: "string", format: "uri" },
            },
          },
          ScrapeRunRequest: {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            properties: {
              url: { type: "string", format: "uri" },
              maxPages: { type: "integer", minimum: 1, maximum: 5, default: 1 },
              limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            },
          },
          Opportunity: {
            type: "object",
            additionalProperties: true,
            required: [
              "title",
              "summary",
              "description",
              "category",
              "organization",
              "location",
              "deadline",
              "imageUrl",
              "detailUrl",
              "applicationUrl",
              "sourceUrl",
              "shareText",
              "status",
              "qualityScore",
              "missingFields",
              "metadata",
            ],
            properties: {
              title: { type: "string" },
              summary: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              category: {
                type: "string",
                enum: ["scholarship", "internship", "fellowship", "program", "other"],
              },
              organization: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              deadline: { type: ["string", "null"], format: "date-time" },
              imageUrl: { type: ["string", "null"], format: "uri" },
              detailUrl: { type: "string", format: "uri" },
              applicationUrl: { type: ["string", "null"], format: "uri" },
              sourceUrl: { type: ["string", "null"], format: "uri" },
              shareText: { type: "string" },
              status: { type: "string", enum: ["complete", "needs_review"] },
              qualityScore: { type: "number" },
              missingFields: {
                type: "array",
                items: { type: "string" },
              },
              metadata: { type: "object", additionalProperties: true },
            },
          },
          ExtractOpportunityResponse: {
            type: "object",
            additionalProperties: false,
            required: ["success", "opportunity"],
            properties: {
              success: { type: "boolean" },
              opportunity: { $ref: "#/components/schemas/Opportunity" },
            },
          },
          ScrapeRunResponse: {
            type: "object",
            additionalProperties: false,
            required: [
              "success",
              "sourceUrl",
              "discovered",
              "extracted",
              "opportunities",
              "errors",
            ],
            properties: {
              success: { type: "boolean" },
              sourceUrl: { type: "string", format: "uri" },
              discovered: { type: "integer" },
              extracted: { type: "integer" },
              opportunities: {
                type: "array",
                items: { $ref: "#/components/schemas/Opportunity" },
              },
              errors: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
          ErrorResponse: {
            type: "object",
            additionalProperties: false,
            required: ["message"],
            properties: {
              message: { type: "string" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
      paths: {
        "/": {
          get: this.discoveryOperation(urls, docsUrl, dashboardUrl, marketingUrl),
        },
        "/v1": {
          get: this.discoveryOperation(urls, docsUrl, dashboardUrl, marketingUrl),
        },
        "/health": {
          get: this.healthOperation(),
        },
        "/v1/health": {
          get: this.healthOperation(),
        },
        "/v1/extract/url": {
          post: this.extractOperation(),
        },
        "/v1/scrape/run": {
          post: this.scrapeOperation(),
        },
      },
    };
  }

  private discoveryOperation(
    urls: { apiBaseUrl: string; openapiUrl: string; apiOriginUrl: string },
    docsUrl: string,
    dashboardUrl: string,
    marketingUrl: string,
  ) {
    return {
      tags: ["Discovery"],
      summary: "Public product overview",
      responses: {
        "200": {
          description: "Discovery payload",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DiscoveryResponse" },
              examples: {
                default: {
                  value: {
                    name: "Scholarship Engine API",
                    service: "edutuengineapi",
                    version: "0.1.0",
                    status: "ok",
                    docsUrl,
                    dashboardUrl,
                    marketingUrl,
                    apiBaseUrl: urls.apiBaseUrl,
                    openapiUrl: urls.openapiUrl,
                    authentication: {
                      required: true,
                      acceptedHeaders: [
                        "x-api-key: <api_key>",
                        "Authorization: Bearer <api_key>",
                      ],
                      apiKeysConfigured: getConfiguredEngineApiKeys().length > 0,
                    },
                    quickstart: [
                      "Create or configure an API key in EDUTU_ENGINE_API_KEYS.",
                      "Call GET /health or GET /v1/health to confirm the service is running.",
                      "Use POST /v1/extract/url to enrich a single opportunity page.",
                      "Use POST /v1/scrape/run to crawl a public source page.",
                    ],
                    endpoints: [
                      {
                        method: "GET",
                        path: "/health",
                        access: "public",
                        description: "Runtime health and environment checks.",
                      },
                      {
                        method: "GET",
                        path: "/v1/health",
                        access: "public",
                        description: "Versioned runtime health and environment checks.",
                      },
                      {
                        method: "POST",
                        path: "/v1/extract/url",
                        access: "api key",
                        description:
                          "Extract a normalized opportunity from one public detail page.",
                      },
                      {
                        method: "POST",
                        path: "/v1/scrape/run",
                        access: "api key",
                        description:
                          "Discover and extract multiple opportunities from one source page.",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private healthOperation() {
    return {
      tags: ["Health"],
      summary: "Runtime health",
      responses: {
        "200": {
          description: "Health payload",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
      },
    };
  }

  private extractOperation() {
    return {
      tags: ["Extraction"],
      summary: "Extract one opportunity page",
      security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ExtractOpportunityRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Extracted opportunity",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExtractOpportunityResponse" },
            },
          },
        },
        "400": { description: "Invalid request body or unsafe URL" },
        "401": { description: "Missing or invalid API key" },
      },
    };
  }

  private scrapeOperation() {
    return {
      tags: ["Scraping"],
      summary: "Discover and extract multiple opportunities",
      security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ScrapeRunRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Scrape run result",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ScrapeRunResponse" },
            },
          },
        },
        "400": { description: "Invalid request body or unsafe URL" },
        "401": { description: "Missing or invalid API key" },
      },
    };
  }

  private getServiceUrls() {
    const port = Number(process.env.PORT || 3100);
    const apiBaseUrl = this.normalizeUrl(
      process.env.EDUTU_ENGINE_PUBLIC_URL || `http://localhost:${port}/v1`,
    );
    const apiOriginUrl = this.normalizeOriginUrl(apiBaseUrl);
    const openapiUrl = this.normalizeUrl(
      process.env.EDUTU_ENGINE_OPENAPI_URL ||
        `${apiBaseUrl.replace(/\/+$/, "")}/openapi.json`,
    );

    return {
      apiBaseUrl,
      apiOriginUrl,
      openapiUrl,
    };
  }

  private normalizeUrl(rawUrl: string) {
    return new URL(rawUrl).toString().replace(/\/$/, "");
  }

  private normalizeOriginUrl(rawUrl: string) {
    const parsed = new URL(rawUrl);
    parsed.pathname = parsed.pathname.replace(/\/v1\/?$/, "/");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  }
}
