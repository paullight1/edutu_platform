import {
  parseOpportunityJourneyBackfillArgs,
  runOpportunityJourneyBackfill,
} from "./opportunity-journey-backfill";

describe("opportunity journey backfill", () => {
  it("defaults to dry-run and clamps operational limits", () => {
    expect(parseOpportunityJourneyBackfillArgs([])).toEqual({
      write: false,
      limit: 500,
      afterUserId: null,
    });
    expect(
      parseOpportunityJourneyBackfillArgs([
        "--write",
        "--dry-run",
        "--limit=99999",
        "--after-user-id=user_20",
      ]),
    ).toEqual({
      write: false,
      limit: 5_000,
      afterUserId: "user_20",
    });
  });

  it("never calls reconciliation in dry-run mode", async () => {
    const compatibility = {
      listLegacyUserIds: jest.fn().mockResolvedValue(["user_1", "user_2"]),
      auditUserParity: jest
        .fn()
        .mockResolvedValueOnce({ mismatches: [{ opportunityId: "one" }] })
        .mockResolvedValueOnce({ mismatches: [] }),
      reconcileUser: jest.fn(),
    };

    const report = await runOpportunityJourneyBackfill(
      compatibility as never,
      { write: false, limit: 10, afterUserId: null },
    );

    expect(compatibility.reconcileUser).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      mode: "dry-run",
      usersScanned: 2,
      usersWithMismatches: 1,
      mismatches: 1,
      nextAfterUserId: "user_2",
    });
  });

  it("requires explicit write mode before applying reconciliation", async () => {
    const compatibility = {
      listLegacyUserIds: jest.fn().mockResolvedValue(["user_1"]),
      auditUserParity: jest.fn(),
      reconcileUser: jest.fn().mockResolvedValue({
        imported: 2,
        updated: 1,
        skipped: 3,
        unsupported: 1,
      }),
    };

    const report = await runOpportunityJourneyBackfill(
      compatibility as never,
      { write: true, limit: 10, afterUserId: null },
    );

    expect(compatibility.auditUserParity).not.toHaveBeenCalled();
    expect(compatibility.reconcileUser).toHaveBeenCalledWith("user_1");
    expect(report).toMatchObject({
      mode: "write",
      imported: 2,
      updated: 1,
      skipped: 3,
      unsupported: 1,
    });
  });

  it("continues after a per-user failure and reports it", async () => {
    const compatibility = {
      listLegacyUserIds: jest.fn().mockResolvedValue(["user_1", "user_2"]),
      auditUserParity: jest
        .fn()
        .mockRejectedValueOnce(new Error("broken row"))
        .mockResolvedValueOnce({ mismatches: [] }),
      reconcileUser: jest.fn(),
    };

    const report = await runOpportunityJourneyBackfill(
      compatibility as never,
      { write: false, limit: 10, afterUserId: null },
    );

    expect(report.usersScanned).toBe(2);
    expect(report.failures).toEqual([
      { userId: "user_1", message: "broken row" },
    ]);
  });
});
