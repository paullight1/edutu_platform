import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../db";
import { CreatorService } from "./creator.service";

jest.mock("../db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), execute: jest.fn() },
}));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
  execute: jest.Mock;
};

describe("CreatorService.getCreatorDashboard", () => {
  let service: CreatorService;
  let whereClauses: unknown[];

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CreatorService({ broadcast: jest.fn() } as any);
    whereClauses = [];
  });

  // Drizzle entity reads remain on select chains; financial ledger reads use
  // db.execute against canonical credit_transactions SQL.
  const wireSelects = (rows: any[][]) => {
    let call = 0;
    mockedDb.select.mockImplementation(() => {
      const result = rows[call++] ?? [];
      const chain: any = {
        from: () => chain,
        where: (clause: unknown) => {
          whereClauses.push(clause);
          return chain;
        },
        orderBy: () => chain,
        limit: () => chain,
        execute: () => Promise.resolve(result),
      };
      return chain;
    });
  };

  const wireLedgerReads = (
    total: number,
    recent: Array<Record<string, unknown>>,
  ) => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ total }] })
      .mockResolvedValueOnce({ rows: recent });
  };

  it("throws Forbidden when neither creator nor mentor is approved", async () => {
    wireSelects([[{ creatorStatus: "none", mentorStatus: "none" }]]);
    await expect(service.getCreatorDashboard("u1")).rejects.toThrow(
      "Creator access not granted.",
    );
  });

  it("returns stats for an approved mentor", async () => {
    wireSelects([
      [{ creatorStatus: "none", mentorStatus: "approved", creditsBalance: 50 }],
      [
        { status: "active", enrollmentCount: 10 },
        { status: "pending", enrollmentCount: 0 },
      ],
      [
        {
          status: "published",
          enrollmentCount: 30,
          ratingAvg: "4.5",
          ratingCount: 2,
        },
        {
          status: "personal",
          enrollmentCount: 5,
          ratingAvg: "0",
          ratingCount: 0,
        },
      ],
    ]);
    wireLedgerReads(900, [{ amount: 500 }]);

    const result = await service.getCreatorDashboard("u1");

    expect(result.stats.publishedContent).toBe(2);
    expect(result.stats.learnersReached).toBe(40);
    expect(result.stats.creditsEarned).toBe(900);
    expect(result.stats.walletBalance).toBe(50);
    expect(result.stats.avgRating).toBe(4.5);
    expect(result.stats.ratingCount).toBe(2);
    expect(result.stats.mentorStatus).toBe("approved");
    expect(result.totalEarnings).toBe(900);
    expect(result.recentEarnings).toEqual([{ amount: 500 }]);
    expect(result.totalEnrollments).toBe(10);
    expect(result.totalListings).toBe(2);
    expect(mockedDb.execute).toHaveBeenCalledTimes(2);
  });

  it("passes the gate for an approved creator (non-mentor)", async () => {
    wireSelects([
      [{ creatorStatus: "approved", mentorStatus: "none", creditsBalance: 0 }],
      [],
      [],
    ]);
    wireLedgerReads(0, []);

    const result = await service.getCreatorDashboard("u1");

    expect(result.stats.mentorStatus).toBe("approved");
    expect(result.stats.publishedContent).toBe(0);
    expect(result.totalEarnings).toBe(0);
  });

  it("matches a raw profile id before authorizing an approved mentor", async () => {
    wireSelects([
      [{ creatorStatus: "none", mentorStatus: "approved", creditsBalance: 0 }],
      [],
      [],
    ]);
    wireLedgerReads(0, []);

    await service.getCreatorDashboard("e5d3a70e-7d51-4759-9c64-60480b88fa2c");

    const profilePredicate = new PgDialect().sqlToQuery(
      whereClauses[0] as SQL,
    ).sql;
    expect(profilePredicate).toContain("clerk_id_to_uuid");
  });

  it("matches a raw profile id before authorizing an approved mentor to create a listing", async () => {
    wireSelects([
      [{ creatorStatus: "none", mentorStatus: "approved", creditsBalance: 0 }],
    ]);
    const insertChain: any = {
      values: () => insertChain,
      returning: () => insertChain,
      execute: () => Promise.resolve([{ id: "listing-1" }]),
    };
    mockedDb.insert.mockReturnValue(insertChain);

    await service.createListing("e5d3a70e-7d51-4759-9c64-60480b88fa2c", {
      title: "Application clinic",
      category: "mentorship",
    });

    const profilePredicate = new PgDialect().sqlToQuery(
      whereClauses[0] as SQL,
    ).sql;
    expect(profilePredicate).toContain("clerk_id_to_uuid");
  });
});

describe("CreatorService.getApplicationStatus", () => {
  let service: CreatorService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CreatorService({ broadcast: jest.fn() } as any);
  });

  it("does not return a creator application for a mentor status lookup", async () => {
    let applicationPredicate: unknown;
    const chain: any = {
      from: () => chain,
      where: (clause: unknown) => {
        applicationPredicate = clause;
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      execute: () =>
        Promise.resolve([
          {
            id: "creator-application",
            applicationKind: "creator",
            status: "approved",
          },
        ]),
    };
    mockedDb.select.mockReturnValue(chain);

    await expect(
      service.getApplicationStatus(
        "e5d3a70e-7d51-4759-9c64-60480b88fa2c",
        "mentor",
      ),
    ).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(applicationPredicate as SQL).sql;
    expect(query).toContain("application_kind");
  });
});

describe("CreatorService.getApplicationProof", () => {
  let service: CreatorService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CreatorService({ broadcast: jest.fn() } as any);
  });

  function wireApplication(rows: Array<Record<string, unknown>>) {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      execute: () => Promise.resolve(rows),
    };
    mockedDb.select.mockReturnValue(chain);
  }

  it("returns only the stored proof fields for an existing application", async () => {
    wireApplication([
      {
        id: "app-1",
        proofPath: "owner/2026-08-29/proof.pdf",
        proofFileName: "eligibility letter.pdf",
        proofFileType: "application/pdf",
        proofFileSize: 2048,
      },
    ]);

    await expect(service.getApplicationProof("app-1")).resolves.toEqual({
      path: "owner/2026-08-29/proof.pdf",
      fileName: "eligibility letter.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });
  });

  it("does not expose an application that has no private proof path", async () => {
    wireApplication([
      {
        id: "app-1",
        proofPath: null,
        proofFileName: null,
        proofFileType: null,
        proofFileSize: null,
      },
    ]);

    await expect(service.getApplicationProof("app-1")).rejects.toThrow(
      "Application proof not found",
    );
  });
});
