import { db } from "../db";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  execute: jest.Mock;
  transaction: jest.Mock;
};

describe("MarketplaceCatalogService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns a bounded public page with an opaque next cursor", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Application clinic",
          category: "mentorship",
          type: "paid",
          price: 100,
          sellerName: "Verified mentor",
          sellerVerified: true,
          createdAt: new Date("2026-08-21T07:00:00.000Z"),
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "CV review",
          category: "career",
          type: "paid",
          price: 80,
          sellerName: "Another mentor",
          sellerVerified: true,
          createdAt: new Date("2026-08-20T07:00:00.000Z"),
        },
      ],
    });

    const service = new MarketplaceCatalogService();
    const result = await service.listPublic({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("sellerId");
    expect(result.items[0]).not.toHaveProperty("email");
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it("fails approval when the seller is no longer approved", async () => {
    const tx = {
      execute: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            sellerApproved: false,
          },
        ],
      }),
    };
    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new MarketplaceCatalogService();
    await expect(
      service.reviewListing(
        "11111111-1111-4111-8111-111111111111",
        "admin-user",
        { decision: "approve" },
      ),
    ).rejects.toThrow("approved creator");
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("fails approval when a paid listing has no learner access URL", async () => {
    const tx = {
      execute: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            type: "paid",
            price: 100,
            accessUrl: null,
            sellerApproved: true,
          },
        ],
      }),
    };
    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new MarketplaceCatalogService();
    await expect(
      service.reviewListing(
        "11111111-1111-4111-8111-111111111111",
        "admin-user",
        { decision: "approve" },
      ),
    ).rejects.toThrow("learner access URL");
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it("updates and audits an approved moderation decision in one transaction", async () => {
    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              type: "paid",
              price: 100,
              accessUrl: "https://example.com/booking",
              sellerApproved: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              status: "active",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new MarketplaceCatalogService();
    await expect(
      service.reviewListing(
        "11111111-1111-4111-8111-111111111111",
        "admin-user",
        { decision: "approve", note: "Reviewed proof and scope." },
      ),
    ).resolves.toEqual(expect.objectContaining({ status: "active" }));
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });
});
