import { db } from "../db";
import { EdutuApiService } from "./edutu-api.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  execute: jest.Mock;
  select: jest.Mock;
};

describe("EdutuApiService", () => {
  let service: EdutuApiService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EdutuApiService({ queryRecommendations: jest.fn() } as any);
  });

  it("returns usage information from the current consumer quota", async () => {
    const result = await service.getUsage({
      id: "consumer-1",
      name: "Scholarship Engine",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: 1000,
      requestId: "req-123",
      quota: {
        limit: 1000,
        remaining: 958,
        resetAt: "2026-07-01T00:00:00.000Z",
      },
    });

    expect(result).toMatchObject({
      object: "usage",
      quota: {
        limit: 1000,
        remaining: 958,
        used: 42,
      },
      meta: {
        requestId: "req-123",
      },
    });
  });

  it("normalizes category slugs into a public list response", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [
        { slug: "fellowships", count: 3 },
        { slug: "open_calls", count: 1 },
      ],
    });

    const result = await service.listCategories({
      id: "consumer-1",
      name: "Scholarship Engine",
      plan: "starter",
      scopes: ["opportunities:read"],
      monthlyQuota: 1000,
      requestId: "req-123",
      quota: {
        limit: 1000,
        remaining: 958,
        resetAt: "2026-07-01T00:00:00.000Z",
      },
    });

    expect(result.data).toEqual([
      { slug: "fellowships", label: "Fellowships", count: 3 },
      { slug: "open_calls", label: "Open Calls", count: 1 },
    ]);
  });

  it("uses the sync defaults when no sync query is supplied", async () => {
    const spy = jest.spyOn(service, "listOpportunities").mockResolvedValue({
      object: "list",
      data: [],
      meta: {},
    } as any);

    await service.syncOpportunities(
      {},
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        plan: "starter",
        scopes: ["opportunities:read"],
        monthlyQuota: 1000,
        requestId: "req-123",
        quota: {
          limit: 1000,
          remaining: 958,
          resetAt: "2026-07-01T00:00:00.000Z",
        },
      },
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeExpired: "true",
        limit: 100,
        sort: "updated_desc",
      }),
      expect.objectContaining({ id: "consumer-1" }),
    );
  });

  it("returns a stable next cursor for the default public feed", async () => {
    const execute = jest.fn().mockResolvedValue([
      {
        id: "opp-1",
        title: "First opportunity",
        description: "First",
        category: "scholarship",
        canonicalCategory: "scholarships",
        type: "scholarship",
        eligibilityCriteria: null,
        fundingType: null,
        targetRegion: null,
        deadline: new Date("2026-06-20T00:00:00.000Z"),
        isRemote: true,
        sourceUrl: "https://example.com/1",
        applyUrl: null,
        imageUrl: null,
        verificationStatus: "verified",
        lastVerifiedAt: new Date("2026-06-20T00:00:00.000Z"),
        lastSeenAt: new Date("2026-06-20T00:00:00.000Z"),
        qualityScore: 90,
        updatedAt: new Date("2026-06-20T00:00:00.000Z"),
        createdAt: new Date("2026-06-19T00:00:00.000Z"),
        match: null,
        match_reasons: [],
        match_risks: [],
        ai_summary: null,
        ai_tags: [],
      },
      {
        id: "opp-2",
        title: "Second opportunity",
        description: "Second",
        category: "program",
        canonicalCategory: "programs",
        type: "program",
        eligibilityCriteria: null,
        fundingType: null,
        targetRegion: null,
        deadline: new Date("2026-06-19T00:00:00.000Z"),
        isRemote: true,
        sourceUrl: "https://example.com/2",
        applyUrl: null,
        imageUrl: null,
        verificationStatus: "verified",
        lastVerifiedAt: new Date("2026-06-19T00:00:00.000Z"),
        lastSeenAt: new Date("2026-06-19T00:00:00.000Z"),
        qualityScore: 88,
        updatedAt: new Date("2026-06-19T00:00:00.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
        match: null,
        match_reasons: [],
        match_risks: [],
        ai_summary: null,
        ai_tags: [],
      },
    ]);
    const limit = jest.fn().mockReturnValue({ execute });
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValue({ from });

    const nextCursorInput = Buffer.from(
      JSON.stringify({
        value: "2026-06-18T23:59:59.000Z",
        id: "opp-0",
      }),
    ).toString("base64url");

    const result = await service.listOpportunities(
      {
        limit: 1,
        sort: "updated_desc",
        cursor: nextCursorInput,
      } as any,
      {
        id: "consumer-1",
        name: "Scholarship Engine",
        plan: "starter",
        scopes: ["opportunities:read"],
        monthlyQuota: 1000,
        requestId: "req-123",
        quota: {
          limit: 1000,
          remaining: 958,
          resetAt: "2026-07-01T00:00:00.000Z",
        },
      },
    );

    expect(orderBy).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(2);
    expect(result.meta).toMatchObject({
      offset: null,
      cursor: nextCursorInput,
      hasMore: true,
    });
    expect(result.meta.nextCursor).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(String(result.meta.nextCursor), "base64url").toString("utf8"),
    );
    expect(decoded).toMatchObject({
      id: "opp-1",
      value: "2026-06-20T00:00:00.000Z",
    });
  });
});
