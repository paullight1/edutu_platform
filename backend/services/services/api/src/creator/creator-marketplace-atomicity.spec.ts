import { db } from "../db";
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

describe("CreatorService marketplace enrollment atomicity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("executes the complete paid enrollment inside one database transaction", async () => {
    const selectResults = [
      [
        {
          id: "listing-1",
          title: "Application clinic",
          status: "active",
          price: 100,
          sellerId: "seller-1",
          enrollmentCount: 3,
        },
      ],
      [{ userId: "buyer-1", creditsBalance: 250 }],
      [],
      [{ userId: "seller-1", creditsBalance: 50 }],
    ];
    let selectIndex = 0;
    let insertIndex = 0;

    const tx: any = {
      select: jest.fn(() => {
        const rows = selectResults[selectIndex++] ?? [];
        const chain: any = {
          from: () => chain,
          where: () => chain,
          limit: () => chain,
          for: () => chain,
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
        insertIndex += 1;
        const chain: any = {
          values: () => chain,
          returning: () => chain,
          execute: () =>
            Promise.resolve(
              insertIndex === 3
                ? [{ id: "enrollment-1", listingId: "listing-1" }]
                : [],
            ),
        };
        return chain;
      }),
    };

    mockedDb.transaction.mockImplementation(async (callback: (value: any) => unknown) =>
      callback(tx),
    );

    const service = new CreatorService({ broadcast: jest.fn() } as any);

    await expect(service.enrollInListing("buyer-1", "listing-1")).resolves.toEqual(
      expect.objectContaining({ id: "enrollment-1" }),
    );
    expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(3);
  });
});
