import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import { CreatorService } from "./creator.service";

jest.mock("../db", () => ({
  db: {
    transaction: jest.fn(),
  },
}));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

const mockedDb = db as unknown as { transaction: jest.Mock };

function createTransaction(selectResults: any[][]) {
  let selectIndex = 0;
  const tx: any = {
    lockCalls: 0,
    select: jest.fn(() => {
      const rows = selectResults[selectIndex++] ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => {
          tx.lockCalls += 1;
          return chain;
        },
        execute: () => Promise.resolve(rows),
      };
      return chain;
    }),
    update: jest.fn(() => {
      const chain: any = {
        set: () => chain,
        where: () => chain,
        execute: () => Promise.resolve([]),
      };
      return chain;
    }),
    insert: jest.fn(() => {
      const chain: any = {
        values: () => chain,
        returning: () => chain,
        execute: () =>
          Promise.resolve([{ id: "enrollment-1", listingId: "listing-1" }]),
      };
      return chain;
    }),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };
  return tx;
}

describe("CreatorService marketplace enrollment atomicity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("executes the complete paid enrollment inside one database transaction with locked balances", async () => {
    const tx = createTransaction([
      [
        {
          id: "listing-1",
          title: "Application clinic",
          status: "active",
          price: 100,
          sellerId: "11111111-1111-4111-8111-111111111111",
          enrollmentCount: 3,
          capacity: 10,
        },
      ],
      [],
      [{ count: 3 }],
      [{ userId: "buyer-1", creditsBalance: 250 }],
      [{ userId: "seller-1", creditsBalance: 50 }],
    ]);

    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(
      service.enrollInListing("buyer-1", "listing-1"),
    ).resolves.toEqual(expect.objectContaining({ id: "enrollment-1" }));
    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.lockCalls).toBe(3); // listing + buyer balance + seller balance
    expect(tx.update).toHaveBeenCalledTimes(3);
    // The only Drizzle insert is the marketplace enrollment itself. Buyer and
    // seller accounting must go through the canonical credit_transactions
    // ledger via transaction-scoped SQL so there is one financial history.
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it("returns an existing enrollment on a safe retry without charging again", async () => {
    const existing = {
      id: "existing-1",
      listingId: "listing-1",
      status: "active",
    };
    const tx = createTransaction([
      [
        {
          id: "listing-1",
          status: "active",
          price: 100,
          sellerId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      [existing],
    ]);

    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(
      service.enrollInListing("buyer-1", "listing-1"),
    ).resolves.toEqual(existing);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("enforces capacity before any credit or enrollment write", async () => {
    const tx = createTransaction([
      [
        {
          id: "listing-1",
          status: "active",
          price: 100,
          sellerId: "11111111-1111-4111-8111-111111111111",
          capacity: 3,
        },
      ],
      [],
      [{ count: 3 }],
    ]);

    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(
      service.enrollInListing("buyer-1", "listing-1"),
    ).rejects.toThrow("capacity");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("rejects paid self-purchase before any financial write", async () => {
    const buyerId = toDatabaseUserId("buyer-1");
    const tx = createTransaction([
      [
        {
          id: "listing-1",
          status: "active",
          price: 100,
          sellerId: buyerId,
        },
      ],
    ]);

    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(
      service.enrollInListing("buyer-1", "listing-1"),
    ).rejects.toThrow("own listing");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("fails closed when a paid listing has no seller profile", async () => {
    const tx = createTransaction([
      [
        {
          id: "listing-1",
          title: "Application clinic",
          status: "active",
          price: 100,
          sellerId: "11111111-1111-4111-8111-111111111111",
          capacity: null,
        },
      ],
      [],
      [{ userId: "buyer-1", creditsBalance: 250 }],
      [],
    ]);

    mockedDb.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(
      service.enrollInListing("buyer-1", "listing-1"),
    ).rejects.toThrow("seller");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });
});
