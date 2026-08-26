import { db } from "../db";
import { OpportunitiesService } from "./opportunities.service";

jest.mock("../db", () => ({
  db: { execute: jest.fn() },
}));

describe("OpportunitiesService quality scorecard", () => {
  const mockedDb = db as unknown as { execute: jest.Mock };
  const service = new OpportunitiesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => mockedDb.execute.mockReset());

  it("returns the catalog-quality aggregate from the database", async () => {
    const aggregate = {
      total: 12,
      active: 10,
      active_missing_deadline: 2,
      active_verified_7d: 8,
      newest_verification_at: new Date("2026-08-25T12:00:00.000Z"),
    };
    mockedDb.execute.mockResolvedValue([aggregate]);

    await expect(service.getQualityScorecard()).resolves.toEqual(aggregate);
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });

  it("returns zeroed metrics for an empty aggregate response", async () => {
    mockedDb.execute.mockResolvedValue([]);

    await expect(service.getQualityScorecard()).resolves.toMatchObject({
      total: 0,
      active: 0,
      active_missing_deadline: 0,
      active_verified_7d: 0,
      newest_verification_at: null,
    });
  });
});
