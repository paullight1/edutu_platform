import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../auth";

const DEFAULT_API_BASE_URL = "http://localhost:3000/v1";
const DEFAULT_DOCS_URL = "https://docs.edutu.org";
const DEFAULT_DASHBOARD_URL = "https://www.edutu.org/dashboard/developer";

const API_KEY_HEADERS = [
  "x-edutu-api-key: <api_key>",
  "x-api-key: <api_key>",
  "Authorization: Bearer <api_key>",
];

const FREE_ENDPOINTS = [
  "GET /v1/health",
  "GET /v1/usage",
  "GET /v1/categories",
];

const CHARGEABLE_ENDPOINTS = [
  "GET /v1/opportunities",
  "GET /v1/opportunities/stats",
  "GET /v1/opportunities/sync",
  "GET /v1/opportunities/:id",
  "POST /v1/recommendations",
  "POST /v1/events",
];

const REQUIRED_SCOPES = {
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
};

@Public()
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
      process.env.EDUTU_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
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
      llmsUrl: `${apiBaseUrl.replace(/\/+$/, "")}/llms.txt`,
      authentication: {
        required: true,
        developerRoutes: {
          paths: ["/developer/*", "/dashboard/developer"],
          scheme: "Clerk user session",
          description:
            "Sign in to Edutu with Clerk to create and manage developer projects and API keys.",
        },
        apiRoutes: {
          paths: ["/v1/*"],
          scheme: "Edutu API key",
          acceptedHeaders: API_KEY_HEADERS,
          description:
            "Use a project API key for server-to-server calls. A Clerk bearer token is not an API key and is not accepted by /v1.",
        },
        publicDocumentation: [
          "GET /v1",
          "GET /v1/llms.txt",
          "GET /v1/openapi.json",
        ],
      },
      quickstart: [
        `Sign in with Clerk and open ${dashboardUrl} to create a developer project.`,
        "Create a project and API key without purchasing credits; new accounts start at zero credits.",
        "Generate an API key once and keep the raw secret safe.",
        "Call GET /v1/health, GET /v1/categories, or GET /v1/usage to confirm access without spending a credit.",
        "Chargeable opportunity, recommendation, and event calls cost one credit and return 402 credits_exhausted at zero.",
      ],
      credits: {
        startingBalance: 0,
        topUps: "one-time",
        expiry: "never",
        chargeableRequestCost: 1,
        exhaustedStatus: 402,
        exhaustedCode: "credits_exhausted",
        freeEndpoints: FREE_ENDPOINTS,
        chargeableEndpoints: CHARGEABLE_ENDPOINTS,
      },
      opportunityVisibility:
        "Admin approval creates a shared catalog record in pending_review/unverified state. Learner and /v1 visibility begins only after verification/enrichment succeeds and the record transitions to active/verified; pending and rejected submissions remain hidden.",
      requiredScopes: REQUIRED_SCOPES,
      endpoints: [
        {
          method: "GET",
          path: "/v1/health",
          access: "public, free",
          description:
            "Runtime diagnostics and readiness status; no API key or credit required.",
        },
        {
          method: "GET",
          path: "/v1/opportunities",
          access: "api key",
          description:
            "Search and page through approved normalized opportunities; costs one credit per request.",
        },
        {
          method: "GET",
          path: "/v1/opportunities/stats",
          access: "api key",
          description:
            "Inspect approved catalog health and coverage; costs one credit per request.",
        },
        {
          method: "GET",
          path: "/v1/opportunities/sync",
          access: "api key",
          description:
            "Delta sync of approved changed rows (requires opportunities:sync); costs one credit per request.",
        },
        {
          method: "GET",
          path: "/v1/opportunities/:id",
          access: "api key",
          description:
            "Fetch a single approved normalized opportunity; costs one credit per request.",
        },
        {
          method: "POST",
          path: "/v1/recommendations",
          access: "api key",
          description:
            "Ranked approved opportunities for a supplied profile; costs one credit per request.",
        },
        {
          method: "POST",
          path: "/v1/events",
          access: "api key",
          description:
            "Record partner impressions, clicks, and conversions; costs one credit per request.",
        },
        {
          method: "GET",
          path: "/v1/categories",
          access: "api key, free",
          description:
            "Discover stable category metadata without spending a credit; authenticated calls still count toward rate and monthly limits.",
        },
        {
          method: "GET",
          path: "/v1/usage",
          access: "api key, free",
          description:
            "Inspect quota and API credit usage without spending a credit; authenticated calls still count toward rate and monthly limits.",
        },
      ],
    };
  }

  /**
   * Plain-markdown API reference designed to be pasted into (or fetched by)
   * an AI coding assistant so it can integrate against the API in one shot.
   */
  @Get("llms.txt")
  @Header("Content-Type", "text/markdown; charset=utf-8")
  getLlmsDocument(): string {
    const apiBaseUrl = this.normalizeBaseUrl(
      process.env.EDUTU_API_PUBLIC_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.API_BASE_URL ||
        DEFAULT_API_BASE_URL,
    );
    const dashboardUrl =
      process.env.EDUTU_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;

    return `# Edutu Scholarship Engine API

> REST API for verified global scholarships, fellowships, internships, and grants.
> Base URL: ${apiBaseUrl}
> Machine-readable spec: ${apiBaseUrl}/openapi.json
> Get an API key: ${dashboardUrl}

## Authentication boundary

Sign in to Edutu with Clerk to access the developer dashboard and \`/developer/*\` routes. Use the dashboard to create a project and generate an Edutu API key; there is no separate developer login.

The \`/v1/*\` API uses the Edutu API key, not the Clerk session token. The documentation endpoints (\`GET /v1\`, \`GET /v1/llms.txt\`, and \`GET /v1/openapi.json\`) are public. \`GET /v1/health\` is public; the other live \`/v1\` operations require an Edutu API key.

Send an Edutu API key in any of these headers:

    x-edutu-api-key: <API_KEY>
    x-api-key: <API_KEY>
    Authorization: Bearer <API_KEY>

Keys look like \`edu_live_<prefix>_<secret>\` (or \`edu_test_...\`). In production, the server stores a peppered HMAC-SHA256 hash keyed by \`API_KEY_PEPPER\` (at least 16 characters), never the raw key. Legacy pre-pepper SHA-256 hashes remain accepted indefinitely while the compatibility matcher is enabled; there is no automatic cutoff. Rotate legacy keys as an operational security action to write the peppered HMAC form, and plan any future compatibility deprecation explicitly. Without a configured pepper, local development retains the legacy SHA-256 fallback. Keep keys on your server by default.

## Projects, credits, and visibility

- Create a project and key at ${dashboardUrl} without purchasing credits. New accounts start with **0 credits**.
- Credit top-ups are one-time purchases. Credits do not expire and there is no recurring API subscription requirement.
- Free endpoints: \`GET /health\`, \`GET /usage\`, and \`GET /categories\`. Free means no credit is consumed; authenticated usage and categories calls still count toward the per-minute rate limit and monthly quota.
- Chargeable endpoints: opportunities, opportunity stats, opportunity sync, opportunity detail, recommendations, and events. Each successful request costs **1 credit**.
- When a chargeable request has no credits, the API returns HTTP \`402 Payment Required\` with \`code: "credits_exhausted"\` and does not execute the paid operation.
- Required scopes are exhaustive: \`opportunities:read\`, \`opportunities:sync\`, \`usage:read\`, \`recommendations:read\`, and \`events:write\`. The endpoint table below maps each protected operation to its scope.
- Admin approval creates a shared catalog record in \`pending_review\`/\`unverified\` state. Learner and \`/v1\` visibility begins only after verification/enrichment succeeds and the record transitions to \`active\`/\`verified\`; pending and rejected submissions remain hidden.
- Use the API server-to-server. A browser-visible key is not secret; direct browser use requires an approved CORS origin and should be limited to cases where that trade-off is understood.

## Endpoints

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | /health | none (public, free) | Liveness and readiness status |
| GET | /opportunities | opportunities:read (1 credit) | Search/list approved opportunities |
| GET | /opportunities/stats | opportunities:read (1 credit) | Approved catalog coverage and freshness |
| GET | /opportunities/sync | opportunities:sync (1 credit) | Delta sync; pass updatedSince |
| GET | /opportunities/{id} | opportunities:read (1 credit) | One approved opportunity by UUID |
| GET | /categories | opportunities:read (free) | Stable category slugs with counts |
| GET | /usage | usage:read (free) | Your quota, credits, and period reset |
| POST | /recommendations | recommendations:read (1 credit) | Ranked matches for a profile you send |
| POST | /events | events:write (1 credit) | Report impressions/clicks/applies back |

## GET /opportunities — query parameters

- q: free-text search (title, description, category, eligibility)
- category | canonicalCategory: slug from GET /categories
- type: scholarship | fellowship | internship | grant | ...
- fundingType, targetRegion: string filters
- remote: "true" | "false"
- deadlineFrom, deadlineTo: date (YYYY-MM-DD) — bound the deadline
- updatedSince: ISO datetime — rows updated on/after (use for polling)
- includeExpired: "true" to keep past-deadline rows (default excluded)
- includeTotal: "true" to add meta.total (extra query, use sparingly)
- limit: 1-100 (default 25), offset: integer OR cursor: opaque string
- sort: updated_desc (default) | updated_asc | created_desc | created_asc | deadline_asc | deadline_desc

### Pagination

Responses include meta.nextCursor when more rows exist. Pass it back as ?cursor=... (preferred over offset; stable under writes). meta.hasMore tells you when to stop.

## Response envelope

Lists: { "object": "list", "data": [...], "meta": { limit, nextCursor, hasMore, total, requestId, quota } }

Opportunity object (stable fields): id, object, title, description, category, canonicalCategory, type, eligibilityCriteria, fundingType, targetRegion, deadline (ISO or null), remote, urls.source, urls.apply, imageUrl, trust.verificationStatus, trust.lastVerifiedAt, trust.lastSeenAt, trust.qualityScore, match, matchReasons, matchRisks, aiSummary, aiTags, updatedAt.

## POST /recommendations — body

{ "limit": 10, "profile": { "country": "NG", "fieldOfStudy": "computer science", "degree": "BSc", "skills": ["python"], "interests": ["AI"], "interestedCountries": ["US", "UK"] }, "preferences": { "preferredCategories": ["scholarships"], "preferredRegions": ["Europe"], "remoteOnly": false, "maxDeadlineDays": 90 } }
All fields optional; more profile signal = better ranking. Returns { object: "recommendation.list", data: [opportunity...], meta }.

## POST /events — body

{ "eventType": "impression" | "view" | "click" | "save" | "apply" | "dismiss" | "recommendation_shown", "opportunityId": "<uuid>", "externalUserId": "<your-user-id>", "sessionId": "...", "metadata": {} }

## Errors (JSON, always this shape)

{ "error": { "message", "status", "code", "retryAfter" }, "requestId": "..." }

- 401 \`missing_api_key\` or \`invalid_api_key\` — the Edutu API key is missing or invalid
- 403 \`scope_required\` — the key lacks the required scope
- 402 \`quota_exceeded\` — monthly quota is exhausted
- 402 \`credits_exhausted\` — the account has zero credits for a chargeable call
- 429 code=rate_limit_exceeded — honor the Retry-After header (seconds)
- 503 \`billing_unavailable\` — credit reservation could not be verified; retry later and the chargeable operation does not execute

Example zero-credit response (redacted):

    HTTP/1.1 402 Payment Required
    {"error":{"message":"API credits exhausted","status":402,"code":"credits_exhausted"},"requestId":"req_..."}

## Limits & headers

Per-minute rate limit and monthly quota depend on your plan (defaults: live 60/min + 1000/mo). Health is public; authenticated usage and categories calls do not consume credits but still consume the applicable rate-limit and monthly-quota allowance. Every response carries: X-RateLimit-Limit/-Remaining/-Reset, X-Edutu-Quota-Limit/-Remaining/-Reset, X-Edutu-Credits-Remaining, X-Edutu-Request-Id. Send an x-request-id header to make retries idempotent for credit billing.

## Quickstart

    curl "${apiBaseUrl}/opportunities?limit=5" -H "x-edutu-api-key: $EDUTU_API_KEY"

    const res = await fetch("${apiBaseUrl}/opportunities?category=scholarships&limit=12", {
      headers: { "x-edutu-api-key": process.env.EDUTU_API_KEY },
    });
    const { data, meta } = await res.json();

Recommended integration pattern: full pull via /opportunities (cursor pagination), then poll /opportunities/sync?updatedSince=<last-run> on a schedule; report engagement via /events; check /usage before large backfills. Never put a production key in client-side JavaScript.
`;
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
    const chargeableErrorResponses = {
      "402": {
        description:
          "Payment Required: monthly quota or one-time API credits are exhausted. A zero-credit chargeable call uses code credits_exhausted and does not execute.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      "503": { $ref: "#/components/responses/BillingUnavailable" },
    };

    return {
      openapi: "3.1.0",
      info: {
        title: "Scholarship Engine Public API",
        version: "0.2.0",
        description:
          "Machine-readable documentation for the public Scholarship Engine API. Clerk authenticates Edutu users on /developer/* and /dashboard/developer; /v1/* uses a separate Edutu API key. Health is public; usage and categories are free in credit terms but their authenticated requests still count toward rate and monthly limits. Each chargeable opportunity, recommendation, or event request costs one non-expiring credit, returns HTTP 402 with code credits_exhausted at zero, and returns HTTP 503 with code billing_unavailable when credit reservation cannot be verified. Admin-approved submissions enter the shared catalog as pending_review/unverified and are shared with Edutu users and API customers only after successful verification/enrichment transitions them to active/verified.",
        contact: {
          name: "Edutu",
          url: docsUrl,
        },
      },
      "x-edutu-contract": {
        authenticationBoundary: {
          clerk: ["/developer/*", "/dashboard/developer"],
          apiKey: ["/v1/*"],
        },
        credits: {
          startingBalance: 0,
          topUps: "one_time",
          expiry: "never",
          chargeableRequestCost: 1,
          freeEndpoints: FREE_ENDPOINTS,
          chargeableEndpoints: CHARGEABLE_ENDPOINTS,
          exhausted: {
            status: 402,
            code: "credits_exhausted",
            operationExecuted: false,
          },
          billingUnavailable: {
            status: 503,
            code: "billing_unavailable",
            operationExecuted: false,
          },
        },
        opportunityVisibility:
          "Admin approval creates a shared catalog record in pending_review/unverified state. Learner and /v1 visibility begins only after verification/enrichment succeeds and the record transitions to active/verified; pending and rejected submissions remain hidden.",
        requiredScopes: REQUIRED_SCOPES,
        integration:
          "Server-to-server by default. Browser use requires approved CORS and exposes the API key to the browser.",
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
            description:
              "Bearer form of the same Edutu API key. This is not a Clerk user session token.",
          },
          clerkAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Clerk session token",
            description:
              "Clerk authenticates the Edutu developer dashboard and /developer/* routes; it is not accepted as credentials for /v1 operations.",
          },
        },
        responses: {
          BillingUnavailable: {
            description:
              "Service Unavailable: credit reservation could not be verified (code: billing_unavailable). Retry later; the chargeable operation does not execute.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                  error: {
                    message: "Billing is temporarily unavailable",
                    status: 503,
                    code: "billing_unavailable",
                  },
                  requestId: "req_...",
                },
              },
            },
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
            description:
              "Filter by opportunity type (e.g. scholarship, fellowship, internship, grant).",
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
            description:
              "Include opportunities with a deadline on or after this date.",
          },
          OpportunityDeadlineTo: {
            name: "deadlineTo",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" },
            description:
              "Include opportunities with a deadline on or before this date.",
          },
          OpportunityUpdatedSince: {
            name: "updatedSince",
            in: "query",
            required: false,
            schema: { type: "string", format: "date-time" },
            description:
              "Only return rows updated on or after this timestamp (use for delta sync).",
          },
          OpportunityLimit: {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            description: "Page size. Maximum 100.",
          },
          OpportunityCursor: {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Opaque pagination cursor returned in the previous response meta.nextCursor.",
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
                      "missing_api_key",
                      "invalid_api_key",
                      "scope_required",
                      "rate_limit_exceeded",
                      "quota_exceeded",
                      "credits_exhausted",
                      "billing_unavailable",
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
              ...chargeableErrorResponses,
            },
          },
        },
        "/opportunities/stats": {
          get: {
            tags: ["Opportunities"],
            summary: "Inspect catalog health and coverage",
            description:
              "Inspect the approved opportunity catalog. This chargeable request costs one credit.",
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
              ...chargeableErrorResponses,
            },
          },
        },
        "/opportunities/sync": {
          get: {
            tags: ["Opportunities"],
            summary: "Pull changes since the last sync window",
            description:
              "Delta sync of approved opportunities. Pass updatedSince to receive only rows changed on or after that timestamp. Requires the opportunities:sync scope and costs one credit.",
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
              ...chargeableErrorResponses,
            },
          },
        },
        "/opportunities/{id}": {
          get: {
            tags: ["Opportunities"],
            summary: "Fetch a single opportunity by ID",
            description:
              "Fetch one approved opportunity. This chargeable request costs one credit.",
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
              ...chargeableErrorResponses,
            },
          },
        },
        "/categories": {
          get: {
            tags: ["Categories"],
            summary: "Return the stable category list",
            description:
              "Discover stable category metadata. This endpoint is free in credit terms, but requires an Edutu API key with opportunities:read and remains subject to the per-minute rate limit and monthly quota.",
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
            description:
              "Inspect quota and credit balance. This endpoint is free in credit terms and does not consume a credit, but remains subject to the per-minute rate limit and monthly quota.",
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
            description:
              "Retrieve ranked approved opportunities for a supplied profile. This chargeable request costs one credit.",
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
              ...chargeableErrorResponses,
            },
          },
        },
        "/events": {
          post: {
            tags: ["Events"],
            summary: "Record a partner event",
            description:
              "Record a partner event. This chargeable request costs one credit.",
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
              ...chargeableErrorResponses,
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
