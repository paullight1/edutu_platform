import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { Public } from "../auth/public.decorator";
import { BillingService } from "../billing/billing.service";
import { OpportunityCatalogService } from "../opportunities/opportunity-catalog.service";
import { stripInternalOpportunityFields } from "../opportunities/public-opportunity-projection";
import { CodexMcpAuth, OPPORTUNITIES_SCOPE } from "./codex-mcp-auth";

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

function toolError(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: { code, message },
  };
}

function publicLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function toSearchResult(row: Record<string, unknown>) {
  const opportunity = stripInternalOpportunityFields(row);
  return {
    title: opportunity.title,
    organization: opportunity.organization ?? null,
    category: opportunity.category ?? null,
    funding: opportunity.funding_type ?? null,
    location: opportunity.location ?? null,
    deadline: opportunity.close_date ?? null,
    summary:
      typeof opportunity.summary === "string"
        ? opportunity.summary.slice(0, 500)
        : null,
    applicationUrl: publicLink(opportunity.application_url),
    sourceUrl: publicLink(opportunity.source_url ?? opportunity.canonical_url),
    edutuUrl: `https://www.edutu.org/opportunity/${encodeURIComponent(String(opportunity.id))}`,
  };
}

@Controller()
export class CodexMcpController {
  constructor(
    private readonly auth: CodexMcpAuth,
    private readonly billing: BillingService,
    private readonly catalog: OpportunityCatalogService,
  ) {}

  @Public()
  @Get(RESOURCE_METADATA_PATH)
  metadata(@Res() response: Response) {
    if (!this.auth.issuer) {
      response.sendStatus(503);
      return;
    }
    response.json({
      resource: this.auth.resource,
      authorization_servers: [this.auth.issuer],
      scopes_supported: [OPPORTUNITIES_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Edutu Opportunities",
    });
  }

  @Public()
  @Get("mcp")
  unsupported(@Res() response: Response) {
    response
      .set("Allow", "POST, OPTIONS")
      .status(405)
      .json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Method not allowed" },
      });
  }

  @Public()
  @Delete("mcp")
  terminate(@Res() response: Response) {
    this.unsupported(response);
  }

  @Public()
  @Post("mcp")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async handle(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.set("Cache-Control", "no-store");
    const resourceMetadataUrl = new URL(
      RESOURCE_METADATA_PATH,
      this.auth.resource,
    ).href;
    const challenge = `Bearer resource_metadata="${resourceMetadataUrl}", scope="${OPPORTUNITIES_SCOPE}"`;
    const principal = await this.auth.authenticate(authorization);
    if (!principal) {
      response
        .set(
          "WWW-Authenticate",
          authorization ? `${challenge}, error="invalid_token"` : challenge,
        )
        .status(401)
        .json({ error: "invalid_token" });
      return;
    }
    if (!principal.scopes.includes(OPPORTUNITIES_SCOPE)) {
      response
        .set("WWW-Authenticate", `${challenge}, error="insufficient_scope"`)
        .status(403)
        .json({ error: "insufficient_scope" });
      return;
    }

    const server = new McpServer({ name: "edutu", version: "0.1.0" });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedOrigins: ["https://chatgpt.com", "https://www.edutu.org"],
    });
    this.registerSearch(server, principal.userId);
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } finally {
      await server.close();
    }
  }

  private registerSearch(server: McpServer, userId: string) {
    server.registerTool(
      "search_opportunities",
      {
        title: "Find global opportunities",
        description:
          "Search Edutu for open, verified scholarships, fellowships, internships and other opportunities worldwide. Requires an active Edutu Pro or Scholar subscription. Text filters are optional. Leave location blank for a worldwide search.",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          q: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .optional()
            .describe("A short keyword or phrase"),
          location: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .optional()
            .describe("Filter by destination location"),
          limit: z.number().int().min(1).max(15).optional(),
        },
      },
      async ({ q, location, limit }) => {
        try {
          const { planTier } = await this.billing.getStatus(userId);
          if (planTier !== "pro" && planTier !== "scholar") {
            return toolError(
              "pro_required",
              "Opportunity search requires an active Edutu Pro or Scholar subscription.",
            );
          }

          const page = await this.catalog.list({
            q,
            location,
            limit: limit ?? 8,
            sort: "newest",
          });
          const result = { items: page.items.map(toSearchResult) };
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch {
          return toolError(
            "search_unavailable",
            "Edutu opportunity search is temporarily unavailable. Please try again.",
          );
        }
      },
    );
  }
}
