import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import { CreatorService } from "./creator.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
};

describe("CreatorService marketplace listing persistence", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("persists the complete reviewed-listing contract using the canonical seller uuid", async () => {
    const selectChain: any = {
      from: () => selectChain,
      where: () => selectChain,
      execute: () =>
        Promise.resolve([
          { creatorStatus: "approved", mentorStatus: "none" },
        ]),
    };
    mockedDb.select.mockReturnValue(selectChain);

    let values: Record<string, unknown> | undefined;
    const insertChain: any = {
      values: (next: Record<string, unknown>) => {
        values = next;
        return insertChain;
      },
      returning: () => insertChain,
      execute: () => Promise.resolve([{ id: "listing-1" }]),
    };
    mockedDb.insert.mockReturnValue(insertChain);

    const service = new CreatorService({ broadcast: jest.fn() } as any);
    await service.createListing("creator-clerk-id", {
      title: "Scholarship clinic",
      description: "Review and feedback",
      category: "mentorship",
      type: "paid",
      price: 120,
      imageUrl: "https://example.com/cover.png",
      previewUrl: "https://example.com/preview",
      tags: ["scholarship", "review"],
      capacity: 12,
    });

    expect(values).toMatchObject({
      sellerId: toDatabaseUserId("creator-clerk-id"),
      title: "Scholarship clinic",
      previewUrl: "https://example.com/preview",
      status: "pending",
    });
  });
});
