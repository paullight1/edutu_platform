import { Controller, Get } from "@nestjs/common";

const DEFAULT_API_BASE_URL = "http://localhost:3000/v1";
const DEFAULT_DOCS_URL = "https://docs.edutu.org";

@Controller("v1")
export class EdutuApiDocsController {
  @Get()
  getApiOverview() {
    const apiBaseUrl = this.normalizeBaseUrl(
      process.env.EDUTU_API_PUBLIC_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.API_BASE_URL ||
        DEFAULT_API_BASE_URL,
    );
    const docsUrl = process.env.EDUTU_DOCS_URL || DEFAULT_DOCS_URL;
    const dashboardUrl =
      process.env.EDUTU_DASHBOARD_URL || "https://www.edutu.org/developers";
    const marketingUrl =
      process.env.EDUTU_MARKETING_URL ||
      "https://www.edutu.org/scholarship-engine";
    const openapiUrl = this.normalizeBaseUrl(
      process.env.EDUTU_API_OPENAPI_URL ||
        `${apiBaseUrl.replace(/\/+$/, "")}/openapi.json`,
    );

    return {
      name: "Scholarship Engine Public API",
      service: "edutu-api",
      version: "0.2.0",
      status: "ok",
      docsUrl,
      dashboardUrl,
      marketingUrl,
      apiBaseUrl,
      openapiUrl,
      authentication: {
        required: true,
        acceptedHeaders: [
          "x-edutu-api-key: <api_key>",
          "x-api-key: <api_key>",
          "Authorization: Bearer <api_key>",
        ],
      },
      quickstart: [
        "Create a developer project in the dashboard.",
        "Generate an API key once and keep the raw secret safe.",
        "Call GET /v1/opportunities or GET /v1/categories to confirm access.",
        "Use GET /v1/usage to inspect credits and quota.",
      ],
      endpoints: [
        {
          method: "GET",
          path: "/v1/health",
          access: "public",
          description: "Runtime diagnostics and readiness status.",
        },
        {
          method: "GET",
          path: "/v1/opportunities",
          access: "api key",
          description: "Search and page through normalized opportunities.",
        },
        {
          method: "GET",
          path: "/v1/opportunities/:id",
          access: "api key",
          description: "Fetch a single normalized opportunity.",
        },
        {
          method: "GET",
          path: "/v1/categories",
          access: "api key",
          description: "Discover stable category metadata.",
        },
        {
          method: "GET",
          path: "/v1/usage",
          access: "api key",
          description: "Inspect quota and API credit usage.",
        },
      ],
    };
  }

  @Get("openapi.json")
  getOpenApiDocument() {
    const apiBaseUrl = this.normalizeBaseUrl(
      process.env.EDUTU_API_PUBLIC_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.API_BASE_URL ||
        DEFAULT_API_BASE_URL,
    );
    const docsUrl = process.env.EDUTU_DOCS_URL || DEFAULT_DOCS_URL;
    const openapiUrl = this.normalizeBaseUrl(
      process.env.EDUTU_API_OPENAPI_URL ||
        `${apiBaseUrl.replace(/\/+$/, "")}/openapi.json`,
    );

    return {
      openapi: "3.1.0",
      info: {
        title: "Scholarship Engine Public API",
        version: "0.2.0",
        description:
          "Machine-readable documentation for the public Scholarship Engine API used by external developers and the Edutu dashboard. All authenticated endpoints are rate-limited per API key (60 req/min on the default plan) and capped by a monthly quota; response headers X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset and Retry-After describe the current window, and X-Edutu-Quota-* headers describe the monthly budget.",
        contact: {
          name: "Edutu",
          url: docsUrl,
        },
      },
      servers: [
        {
          url: apiBaseUrl,
          description: "Canonical versioned API base URL",
        },
        {
          url: openapiUrl.replace(/\/openapi\.json$/, ""),
          description: "Base URL used to resolve the OpenAPI document",
        },
      ],
      tags: [
        {
          name: "Health",
          description: "Service readiness and runtime diagnostics.",
        },
        {
          name: "Opportunities",
          description: "Search, inspect, and sync opportunity data.",
        },
        {
          name: "Categories",
          description: "Discover stable category metadata.",
        },
        {
          name: "Usage",
          description: "Inspect quota and credits for the current consumer.",
        },
        {
          name: "Recommendations",
          description: "Retrieve ranked opportunities for a profile.",
        },
        {
          name: "Events",
          description: "Record partner events and conversions.",
        },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-edutu-api-key",
            description:
              "Provide the customer API key issued from the dashboard. The backend also accepts x-api-key for backward compatibility.",
          },
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "opaque api key",
            description: "Bearer token form of the same customer API key.",
          },
        },
        parameters: {
          OpportunityQ: {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Full-text search across title, summary, and tags.",
          },
          OpportunityCategory: {
            name: "category",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Filter by category slug. See GET /v1/categories.",
          },
          OpportunityCanonicalCategory: {
            name: "canonicalCategory",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Filter by the normalized canonical category.",
          },
          OpportunityType: {
            name: "type",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Filter by opportunity type (e.g. scholarship, fellowship, internship, grant).",
          },
          OpportunityFundingType: {
            name: "fundingType",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          OpportunityTargetRegion: {
            name: "targetRegion",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          OpportunityRemote: {
            name: "remote",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["true", "false"] },
          },
          OpportunityDeadlineFrom: {
            name: "deadlineFrom",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" },
            description: "Include opportunities with a deadline on or after this date.",
          },
          OpportunityDeadlineTo: {
            name: "deadlineTo",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" },
            description: "Include opportunities with a deadline on or before this date.",
          },
          OpportunityUpdatedSince: {
            name: "updatedSince",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
            description: "Only return rows updated on or after this timestamp (use for delta sync).",
          },
          OpportunityLimit: {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            description: "Page size. Maximum 100.",
          },
          OpportunityCursor: {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Opaque pagination cursor returned in the previous response meta.next_cursor.",
          },
          OpportunitySort: {
            name: "sort",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: [
                "updated_desc",
                "updated_asc",
                "created_desc",
                "created_asc",
                "deadline_asc",
                "deadline_desc",
              ],
            },
          },
        },
        schemas: {
          ApiQuota: {
            type: "object",
            additionalProperties: false,
            required: ["limit", "remaining", "resetAt"],
            properties: {
              limit: { type: ["integer", "null"] },
              remaining: { type: ["integer", "null"] },
              resetAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          OpportunityUrlBundle: {
            type: "object",
            additionalProperties: false,
            required: ["source", "apply"],
            properties: {
              source: { type: ["string", "null"], format: "uri" },
              apply: { type: ["string", "null"], format: "uri" },
            },
          },
          OpportunityTrust: {
            type: "object",
            additionalProperties: false,
            required: [
              "verificationStatus",
              "lastVerifiedAt",
              "lastSeenAt",
              "qualityScore",
            ],
            properties: {
              verificationStatus: { type: ["string", "null"] },
              lastVerifiedAt: { type: ["string", "null"], format: "date-time" },
              lastSeenAt: { type: ["string", "null"], format: "date-time" },
              qualityScore: { type: ["number", "null"] },
            },
          },
          Opportunity: {
            type: "object",
            additionalProperties: true,
            required: [
              "id",
              "object",
              "title",
              "description",
              "category",
              "canonicalCategory",
              "type",
              "eligibilityCriteria",
              "fundingType",
              "targetRegion",
              "deadline",
              "remote",
              "urls",
              "imageUrl",
              "trust",
              "match",
              "matchReasons",
              "matchRisks",
              "aiSummary",
              "aiTags",
              "updatedAt",
            ],
            properties: {
              id: { type: "string" },
              object: { type: "string", enum: ["opportunity"] },
              title: { type: "string" },
              description: { type: ["string", "null"] },
              category: { type: ["string", "null"] },
              canonicalCategory: { type: ["string", "null"] },
              type: { type: ["string", "null"] },
              eligibilityCriteria: { type: ["string", "null"] },
              fundingType: { type: ["string", "null"] },
              targetRegion: { type: ["string", "null"] },
              deadline: { type: ["string", "null"], format: "date-time" },
              remote: { type: ["boolean", "null"] },
              urls: { $ref: "#/components/schemas/OpportunityUrlBundle" },
              imageUrl: { type: ["string", "null"], format: "uri" },
              trust: { $ref: "#/components/schemas/OpportunityTrust" },
              match: { type: ["number", "null"] },
              matchReasons: {
                type: "array",
                items: { type: "string" },
              },
              matchRisks: {
                type: "array",
                items: { type: "string" },
              },
              aiSummary: { type: ["string", "null"] },
              aiTags: {
                type: "array",
                items: { type: "string" },
              },
              updatedAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          OpportunityListResponse: {
            type: "object",
            additionalProperties: false,
            required: ["object", "data", "meta"],
            properties: {
              object: { type: "string", enum: ["list"] },
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Opportunity" },
              },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          OpportunityStatsResponse: {
            type: "object",
            additionalProperties: false,
            required: [
              "object",
              "active",
              "closingSoon",
              "categoryCount",
              "verifiedCount",
              "needsVerification",
              "brokenLinkCount",
              "lastUpdatedAt",
              "meta",
            ],
            properties: {
              object: { type: "string", enum: ["opportunity.catalog_stats"] },
              active: { type: "integer" },
              closingSoon: { type: "integer" },
              categoryCount: { type: "integer" },
              verifiedCount: { type: "integer" },
              needsVerification: { type: "integer" },
              brokenLinkCount: { type: "integer" },
              lastUpdatedAt: { type: ["string", "null"], format: "date-time" },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          CategoryResponse: {
            type: "object",
            additionalProperties: false,
            required: ["slug", "label", "count"],
            properties: {
              slug: { type: "string" },
              label: { type: "string" },
              count: { type: "integer" },
            },
          },
          CategoryListResponse: {
            type: "object",
            additionalProperties: false,
            required: ["object", "data", "meta"],
            properties: {
              object: { type: "string", enum: ["list"] },
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/CategoryResponse" },
              },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          UsageResponse: {
            type: "object",
            additionalProperties: false,
            required: [
              "object",
              "consumer",
              "credits",
              "period",
              "quota",
              "meta",
            ],
            properties: {
              object: { type: "string", enum: ["usage"] },
              consumer: {
                type: "object",
                additionalProperties: false,
                required: ["id", "name", "plan"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  plan: { type: "string" },
                },
              },
              credits: {
                type: "object",
                additionalProperties: false,
                required: ["remaining"],
                properties: {
                  remaining: { type: ["integer", "null"] },
                },
              },
              period: {
                type: "object",
                additionalProperties: false,
                required: ["resetAt"],
                properties: {
                  resetAt: { type: ["string", "null"], format: "date-time" },
                },
              },
              quota: { $ref: "#/components/schemas/ApiQuota" },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          RecommendationResponse: {
            type: "object",
            additionalProperties: false,
            required: ["object", "data", "meta"],
            properties: {
              object: { type: "string", enum: ["recommendation.list"] },
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Opportunity" },
              },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          EventResponse: {
            type: "object",
            additionalProperties: false,
            required: ["object", "id", "accepted", "createdAt", "meta"],
            properties: {
              object: { type: "string", enum: ["event"] },
              id: { type: "string" },
              accepted: { type: "boolean" },
              createdAt: { type: "string", format: "date-time" },
              meta: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          ErrorResponse: {
            type: "object",
            additionalProperties: false,
            required: ["error", "requestId"],
            properties: {
              error: {
                type: "object",
                additionalProperties: false,
                required: ["message", "status"],
                properties: {
                  message: { type: "string" },
                  status: { type: "integer" },
                  code: {
                    type: ["string", "null"],
                    enum: [
                      "rate_limit_exceeded",
                      "quota_exceeded",
                      "credits_exhausted",
                      null,
                    ],
                    description:
                      "Stable machine-readable error code. Use this for branching, not the human message.",
                  },
                  details: { type: ["array", "object", "null"] },
                  quota: { type: ["object", "null"] },
                  retryAfter: {
                    type: ["integer", "null"],
                    description:
                      "Seconds to wait before retrying. Present on 429 rate-limit errors.",
                  },
                },
              },
              requestId: { type: ["string", "null"] },
            },
          },
        },
      },
      paths: {
        "/health": {
          get: {
            tags: ["Health"],
            summary: "Public runtime status",
            security: [],
            responses: {
              "200": {
                description: "Health payload",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
              },
              "401": { description: "Missing or invalid API key" },
            },
          },
        },
        "/opportunities": {
          get: {
            tags: ["Opportunities"],
            summary: "List normalized opportunities",
            description:
              "Search and page through the curated opportunity catalog. Responses are scoped to public/approved records. Rate-limited per key; see X-RateLimit-* and Retry-After headers.",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            parameters: [
              { $ref: "#/components/parameters/OpportunityQ" },
              { $ref: "#/components/parameters/OpportunityCategory" },
              { $ref: "#/components/parameters/OpportunityCanonicalCategory" },
              { $ref: "#/components/parameters/OpportunityType" },
              { $ref: "#/components/parameters/OpportunityFundingType" },
              { $ref: "#/components/parameters/OpportunityTargetRegion" },
              { $ref: "#/components/parameters/OpportunityRemote" },
              { $ref: "#/components/parameters/OpportunityDeadlineFrom" },
              { $ref: "#/components/parameters/OpportunityDeadlineTo" },
              { $ref: "#/components/parameters/OpportunityLimit" },
              { $ref: "#/components/parameters/OpportunityCursor" },
              { $ref: "#/components/parameters/OpportunitySort" },
            ],
            responses: {
              "200": {
                description: "Opportunity list",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/OpportunityListResponse",
                    },
                  },
                },
              },
              "401": {
                description: "Missing or invalid API key",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                  },
                },
              },
              "403": {
                description: "Valid key but missing required scope",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                  },
                },
              },
              "402": {
                description: "Monthly quota exceeded (code: quota_exceeded)",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                  },
                },
              },
              "429": {
                description:
                  "Per-minute rate limit exceeded (code: rate_limit_exceeded). Honor Retry-After.",
                headers: {
                  "Retry-After": {
                    schema: { type: "integer" },
                    description: "Seconds to wait before retrying.",
                  },
                },
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                  },
                },
              },
            },
          },
        },
        "/opportunities/stats": {
          get: {
            tags: ["Opportunities"],
            summary: "Inspect catalog health and coverage",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            responses: {
              "200": {
                description: "Opportunity stats",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/OpportunityStatsResponse",
                    },
                  },
                },
              },
            },
          },
        },
        "/opportunities/sync": {
          get: {
            tags: ["Opportunities"],
            summary: "Pull changes since the last sync window",
            description:
              "Delta sync. Pass updatedSince to receive only rows changed on or after that timestamp. Requires the opportunities:sync scope.",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            parameters: [
              { $ref: "#/components/parameters/OpportunityUpdatedSince" },
              { $ref: "#/components/parameters/OpportunityLimit" },
              { $ref: "#/components/parameters/OpportunityCursor" },
            ],
            responses: {
              "200": {
                description: "Opportunity list response with sync semantics",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/OpportunityListResponse",
                    },
                  },
                },
              },
              "401": {
                description: "Missing or invalid API key",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                  },
                },
              },
              "403": { description: "Missing required scope" },
              "429": {
                description: "Rate limit exceeded (code: rate_limit_exceeded).",
                headers: {
                  "Retry-After": { schema: { type: "integer" } },
                },
              },
            },
          },
        },
        "/opportunities/{id}": {
          get: {
            tags: ["Opportunities"],
            summary: "Fetch a single opportunity by ID",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": {
                description: "Opportunity detail",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Opportunity" },
                  },
                },
              },
              "404": { description: "Opportunity not found" },
            },
          },
        },
        "/categories": {
          get: {
            tags: ["Categories"],
            summary: "Return the stable category list",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            responses: {
              "200": {
                description: "Category list",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CategoryListResponse",
                    },
                  },
                },
              },
            },
          },
        },
        "/usage": {
          get: {
            tags: ["Usage"],
            summary: "Inspect quota and credits for the current consumer",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            responses: {
              "200": {
                description: "Usage summary",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/UsageResponse" },
                  },
                },
              },
            },
          },
        },
        "/recommendations": {
          post: {
            tags: ["Recommendations"],
            summary: "Retrieve ranked opportunity recommendations",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            responses: {
              "200": {
                description: "Recommendation response",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/RecommendationResponse",
                    },
                  },
                },
              },
            },
          },
        },
        "/events": {
          post: {
            tags: ["Events"],
            summary: "Record a partner event",
            security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
            responses: {
              "200": {
                description: "Event accepted",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/EventResponse" },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private normalizeBaseUrl(rawUrl: string) {
    return new URL(rawUrl).toString().replace(/\/$/, "");
  }
}
