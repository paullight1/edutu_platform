import * as crypto from "crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../db";
import { DeveloperService } from "./developer.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  execute: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const dialect = new PgDialect();

function renderedSql(value: unknown) {
  return dialect.sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("DeveloperService", () => {
  let service: DeveloperService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DeveloperService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a developer project with a hashed key and stored ownership metadata", async () => {
    const execute = jest.fn().mockResolvedValue([
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        contactEmail: "dev@example.com",
        keyPrefix: "edu_live_abcd1234",
        status: "active",
        plan: "starter",
        environment: "live",
        allowedScopes: ["opportunities:read", "usage:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        lastUsedAt: null,
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date("2026-06-19T08:00:00.000Z"),
        updatedAt: new Date("2026-06-19T08:00:00.000Z"),
      },
    ]);
    const returning = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ returning });
    mockedDb.insert.mockReturnValue({ values });

    const result = await service.createProject("db-user-1", "dev@example.com", {
      name: "Scholarship Engine",
      environment: "live",
      scopes: ["opportunities:read", "usage:read"],
      monthlyQuota: 1000,
      rateLimitPerMinute: 60,
    });

    expect(result.rawKey).toMatch(/^edu_live_[a-f0-9]{8}_[a-f0-9]{40}$/);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "db-user-1",
        contactEmail: "dev@example.com",
        keyPrefix: expect.stringMatching(/^edu_live_[a-f0-9]{8}$/),
        apiKeyHash: crypto
          .createHash("sha256")
          .update(result.rawKey)
          .digest("hex"),
      }),
    );
    expect(result.project).toMatchObject({
      id: "consumer-1",
      keyPrefix: "edu_live_abcd1234",
      requestCount: 0,
      remainingQuota: 1000,
      monthlyQuota: 1000,
    });
  });

  it("creates a project without Pro status or API-credit eligibility", async () => {
    const execute = jest.fn().mockResolvedValue([
      {
        id: "consumer-zero-credit",
        name: "Zero Credit Project",
        contactEmail: "new@example.com",
        keyPrefix: "edu_live_1234abcd",
        status: "active",
        plan: "starter",
        environment: "live",
        allowedScopes: ["opportunities:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        lastUsedAt: null,
        revokedAt: null,
        expiresAt: null,
        createdAt: new Date("2026-06-19T08:00:00.000Z"),
        updatedAt: new Date("2026-06-19T08:00:00.000Z"),
      },
    ]);
    const returning = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ returning });
    mockedDb.insert.mockReturnValue({ values });

    const result = await service.createProject(
      "new-user-zero-credit",
      "new@example.com",
      {
        name: "Zero Credit Project",
        environment: "live",
        scopes: ["opportunities:read"],
      },
    );

    expect(result.project).toMatchObject({
      id: "consumer-zero-credit",
      plan: "starter",
    });
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("summarizes projects and recent requests for the dashboard", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "consumer-1",
            name: "Scholarship Engine",
            contact_email: "dev@example.com",
            key_prefix: "edu_live_a1b2c3d4",
            status: "active",
            plan: "starter",
            environment: "live",
            allowed_scopes: ["opportunities:read", "usage:read"],
            monthly_quota: 1000,
            rate_limit_per_minute: 60,
            last_used_at: "2026-06-20T10:00:00.000Z",
            revoked_at: null,
            expires_at: null,
            created_at: "2026-06-19T08:00:00.000Z",
            updated_at: "2026-06-20T10:00:00.000Z",
            request_count: 42,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "usage-1",
            request_id: "req_123",
            method: "GET",
            endpoint: "/v1/opportunities",
            status_code: 200,
            latency_ms: 88,
            created_at: "2026-06-20T10:00:00.000Z",
            consumer_id: "consumer-1",
            consumer_name: "Scholarship Engine",
            key_prefix: "edu_live_a1b2c3d4",
            environment: "live",
          },
        ],
      });

    const dashboard = await service.getDashboard(
      "db-user-1",
      "dev@example.com",
    );

    expect(dashboard.summary).toMatchObject({
      totalProjects: 1,
      activeProjects: 1,
      totalRequestsThisMonth: 42,
      totalMonthlyQuota: 1000,
      totalRemainingQuota: 958,
      unlimitedProjects: 0,
      latestActivityAt: "2026-06-20T10:00:00.000Z",
    });
    expect(dashboard.projects[0]).toMatchObject({
      id: "consumer-1",
      keyPrefix: "edu_live_a1b2c3d4",
      requestCount: 42,
      remainingQuota: 958,
    });
    expect(dashboard.recentRequests[0]).toMatchObject({
      requestId: "req_123",
      endpoint: "/v1/opportunities",
      consumerId: "consumer-1",
    });
  });

  it("revokes a project and returns the refreshed project state", async () => {
    const set = jest.fn();
    const where = jest.fn();
    const execute = jest.fn().mockResolvedValue([
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        contactEmail: "dev@example.com",
        keyPrefix: "edu_live_a1b2c3d4",
        status: "revoked",
        plan: "starter",
        environment: "live",
        allowedScopes: ["opportunities:read", "usage:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        lastUsedAt: "2026-06-20T10:00:00.000Z",
        revokedAt: "2026-06-21T10:00:00.000Z",
        expiresAt: null,
        createdAt: "2026-06-19T08:00:00.000Z",
        updatedAt: "2026-06-21T10:00:00.000Z",
        requestCount: 42,
      },
    ]);
    const returning = jest.fn().mockReturnValue({ execute });
    where.mockReturnValue({ returning });
    set.mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });
    mockedDb.execute.mockResolvedValue({
      rows: [
        {
          id: "consumer-1",
          name: "Scholarship Engine",
          contact_email: "dev@example.com",
          key_prefix: "edu_live_a1b2c3d4",
          status: "revoked",
          plan: "starter",
          environment: "live",
          allowed_scopes: ["opportunities:read", "usage:read"],
          monthly_quota: 1000,
          rate_limit_per_minute: 60,
          last_used_at: "2026-06-20T10:00:00.000Z",
          revoked_at: "2026-06-21T10:00:00.000Z",
          expires_at: null,
          created_at: "2026-06-19T08:00:00.000Z",
          updated_at: "2026-06-21T10:00:00.000Z",
          request_count: 0,
        },
      ],
    });

    const project = await service.revokeProject("db-user-1", "consumer-1");

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "revoked",
        revokedAt: expect.any(Date),
      }),
    );
    expect(project.status).toBe("revoked");
    expect(project.revokedAt).toBe("2026-06-21T10:00:00.000Z");
  });

  it("rotates a project key and returns the new raw key only once", async () => {
    const rotateSpy = jest
      .spyOn(service as any, "findOwnedProject")
      .mockResolvedValueOnce({
        id: "consumer-1",
        name: "Scholarship Engine",
        contact_email: "dev@example.com",
        key_prefix: "edu_live_a1b2c3d4",
        status: "active",
        plan: "starter",
        environment: "live",
        allowed_scopes: ["opportunities:read", "usage:read"],
        monthly_quota: 1000,
        rate_limit_per_minute: 60,
        last_used_at: "2026-06-20T10:00:00.000Z",
        revoked_at: null,
        expires_at: null,
        created_at: "2026-06-19T08:00:00.000Z",
        updated_at: "2026-06-20T10:00:00.000Z",
        request_count: 42,
      } as any)
      .mockResolvedValueOnce({
        id: "consumer-1",
        name: "Scholarship Engine",
        contact_email: "dev@example.com",
        key_prefix: "edu_live_a1b2c3d4",
        status: "active",
        plan: "starter",
        environment: "live",
        allowed_scopes: ["opportunities:read", "usage:read"],
        monthly_quota: 1000,
        rate_limit_per_minute: 60,
        last_used_at: "2026-06-20T10:00:00.000Z",
        revoked_at: null,
        expires_at: null,
        created_at: "2026-06-19T08:00:00.000Z",
        updated_at: "2026-06-21T10:00:00.000Z",
        request_count: 42,
      } as any);

    const set = jest.fn();
    const where = jest.fn();
    const execute = jest.fn().mockResolvedValue([
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        contactEmail: "dev@example.com",
        keyPrefix: "edu_live_a1b2c3d4",
        status: "active",
        plan: "starter",
        environment: "live",
        allowedScopes: ["opportunities:read", "usage:read"],
        monthlyQuota: 1000,
        rateLimitPerMinute: 60,
        lastUsedAt: "2026-06-20T10:00:00.000Z",
        revokedAt: null,
        expiresAt: null,
        createdAt: "2026-06-19T08:00:00.000Z",
        updatedAt: "2026-06-21T10:00:00.000Z",
        requestCount: 42,
      },
    ]);
    const returning = jest.fn().mockReturnValue({ execute });
    where.mockReturnValue({ returning });
    set.mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });

    const result = await service.rotateProject("db-user-1", "consumer-1");

    expect(rotateSpy).toHaveBeenCalledTimes(2);
    expect(result.rawKey).toMatch(/^edu_live_a1b2c3d4_[a-f0-9]{40}$/);
    expect(result.project).toMatchObject({
      id: "consumer-1",
      status: "active",
      keyPrefix: "edu_live_a1b2c3d4",
    });
    expect(JSON.stringify(result.project)).not.toContain(result.rawKey);
    expect(JSON.stringify(result.project)).not.toContain("apiKeyHash");
  });

  it("uses the legacy email fallback only for rows without canonical ownership", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    await service.listProjects("user-b", "DEV@example.com");

    const query = renderedSql(mockedDb.execute.mock.calls[0][0]);
    expect(query.sql).toContain(
      '"api_consumers"."owner_user_id" = $2 or ("api_consumers"."owner_user_id" is null and lower("api_consumers"."contact_email") = $3)',
    );
    expect(query.params.slice(-2)).toEqual(["user-b", "dev@example.com"]);
  });

  it("fails closed when a project listing has no authenticated user id", async () => {
    await expect(service.listProjects("", "dev@example.com")).rejects.toThrow(
      "Authenticated user required",
    );
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("does not create a project without canonical authenticated ownership", async () => {
    await expect(
      service.createProject("  ", "dev@example.com", {
        name: "Unowned project",
      }),
    ).rejects.toThrow("Authenticated user required");
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it("never uses email fallback for revocation", async () => {
    const where = jest.fn().mockReturnValue({
      returning: jest
        .fn()
        .mockReturnValue({ execute: jest.fn().mockResolvedValue([]) }),
    });
    mockedDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({ where }),
    });

    await expect(service.revokeProject("user-b", "consumer-1")).rejects.toThrow(
      "Developer project not found",
    );

    const query = renderedSql(where.mock.calls[0][0]);
    expect(query.sql).not.toContain("contact_email");
    expect(query.params).toEqual(["consumer-1", "user-b"]);
  });

  it("never uses email fallback for rotation", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });

    await expect(service.rotateProject("user-b", "consumer-1")).rejects.toThrow(
      "Developer project not found",
    );
    expect(mockedDb.update).not.toHaveBeenCalled();

    const query = renderedSql(mockedDb.execute.mock.calls[0][0]);
    expect(query.sql.slice(query.sql.indexOf("where"))).not.toContain(
      "contact_email",
    );
    expect(query.params).toEqual(["consumer-1", "user-b"]);
  });
});
