import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { BillingService } from "../billing/billing.service";
import { OpportunityCatalogService } from "../opportunities/opportunity-catalog.service";
import { CodexMcpAuth } from "./codex-mcp-auth";
import { CodexMcpController } from "./codex-mcp.controller";

jest.mock("../db", () => ({ db: {} }));

describe("Edutu MCP", () => {
  let app: INestApplication;
  const authenticate = jest.fn();
  const getStatus = jest.fn();
  const list = jest.fn();
  const resource = "https://backend.edutu.org/mcp";

  const send = (method: string, params: unknown, token?: string) => {
    const req = request(app.getHttpServer())
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method, params });
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CodexMcpController],
      providers: [
        {
          provide: CodexMcpAuth,
          useValue: {
            issuer: "https://clerk.edutu.org",
            resource,
            authenticate,
          },
        },
        { provide: BillingService, useValue: { getStatus } },
        { provide: OpportunityCatalogService, useValue: { list } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    authenticate.mockResolvedValue(null);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("discovers OAuth and challenges unauthenticated clients before billing or catalog access", async () => {
    const challenge = await send("tools/list", {}).expect(401);
    expect(challenge.headers["www-authenticate"]).toContain(
      "https://backend.edutu.org/.well-known/oauth-protected-resource/mcp",
    );
    const metadata = await request(app.getHttpServer())
      .get("/.well-known/oauth-protected-resource/mcp")
      .expect(200);
    expect(metadata.body).toMatchObject({
      resource,
      authorization_servers: ["https://clerk.edutu.org"],
      scopes_supported: ["opportunities:read"],
    });
    expect(getStatus).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects tokens missing the search scope", async () => {
    authenticate.mockResolvedValue({ userId: "user_123", scopes: [] });
    const response = await send("tools/list", {}, "token").expect(403);
    expect(response.headers["www-authenticate"]).toContain(
      "insufficient_scope",
    );
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("lists a single read-only search tool without querying billing or listings", async () => {
    authenticate.mockResolvedValue({
      userId: "user_123",
      scopes: ["opportunities:read"],
    });
    const response = await send("tools/list", {}, "token").expect(200);
    expect(response.body.result.tools).toEqual([
      expect.objectContaining({
        name: "search_opportunities",
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
    ]);
    expect(getStatus).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("checks the current paid tier on every search and filters the returned fields", async () => {
    authenticate.mockResolvedValue({
      userId: "user_123",
      scopes: ["opportunities:read"],
    });
    getStatus
      .mockResolvedValueOnce({ planTier: "lite" })
      .mockResolvedValueOnce({ planTier: "pro" })
      .mockResolvedValueOnce({ planTier: "none" });
    list.mockResolvedValue({
      items: [
        {
          id: "opp-1",
          title: "Global Fellowship",
          summary: "A fellowship",
          application_url: "javascript:alert(1)",
          original_json: { internal: true },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    const params = {
      name: "search_opportunities",
      arguments: { q: "fellowship" },
    };
    const lite = await send("tools/call", params, "token").expect(200);
    expect(lite.body.result).toMatchObject({
      isError: true,
      structuredContent: { code: "pro_required" },
    });
    expect(list).not.toHaveBeenCalled();

    const pro = await send("tools/call", params, "token").expect(200);
    expect(pro.body.result.structuredContent.items).toEqual([
      expect.objectContaining({
        title: "Global Fellowship",
        applicationUrl: null,
      }),
    ]);
    expect(pro.body.result.structuredContent.items[0]).not.toHaveProperty(
      "original_json",
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "fellowship", limit: 8 }),
    );

    const expired = await send("tools/call", params, "token").expect(200);
    expect(expired.body.result.structuredContent.code).toBe("pro_required");
    expect(getStatus.mock.calls).toEqual([
      ["user_123"],
      ["user_123"],
      ["user_123"],
    ]);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
