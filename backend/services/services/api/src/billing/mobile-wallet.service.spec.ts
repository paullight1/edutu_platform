import { BadRequestException, NotFoundException } from "@nestjs/common";
import { db, pool } from "../db";
import { MobileWalletService } from "./mobile-wallet.service";

describe("MobileWalletService", () => {
  const service = new MobileWalletService();
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await pool.end();
  });
  function transaction(
    row: Record<string, unknown> | null,
    rest: unknown[] = [],
  ) {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    execute.mockResolvedValueOnce({ rows: row ? [row] : [] });
    for (const result of rest) execute.mockResolvedValueOnce(result);
    jest
      .spyOn(db, "transaction")
      .mockImplementation(async (callback: any) => callback({ execute }));
    return execute;
  }
  it("does not mint a repeated daily claim", async () => {
    const execute = transaction({
      user_id: "u",
      streak: 4,
      already_claimed: true,
    });
    await expect(service.claim("user_clerk", "DAILY_LOGIN")).resolves.toEqual({
      earned: 0,
      streak: 4,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("grants the seventh-day bonus with a balance update and ledger insert", async () => {
    const execute = transaction({
      user_id: "u",
      streak: 6,
      continues_streak: true,
    });
    await expect(service.claim("user_clerk", "DAILY_LOGIN")).resolves.toEqual({
      earned: 3,
      streak: 7,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("resets an expired streak", async () => {
    transaction({ user_id: "u", streak: 12, continues_streak: false });
    await expect(service.claim("user_clerk", "DAILY_LOGIN")).resolves.toEqual({
      earned: 1,
      streak: 1,
    });
  });
  it("never grants a client-asserted referral reward", async () => {
    await expect(
      service.claim("user_clerk", "REFER_FRIEND"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("does not grant goal credits without completion evidence", async () => {
    const execute = transaction({ user_id: "u", streak: 0 }, [
      { rows: [] },
      { rows: [] },
    ]);
    await expect(service.claim("user_clerk", "COMPLETE_GOAL")).resolves.toEqual(
      { earned: 0, streak: 0 },
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("fails for missing profiles without adding a ledger entry", async () => {
    const execute = transaction(null);
    await expect(
      service.claim("user_clerk", "DAILY_LOGIN"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("propagates a ledger failure out of the transaction for rollback", async () => {
    const execute = transaction({ user_id: "u", streak: 0 });
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("ledger unavailable"));
    await expect(service.claim("user_clerk", "DAILY_LOGIN")).rejects.toThrow(
      "ledger unavailable",
    );
  });
});
