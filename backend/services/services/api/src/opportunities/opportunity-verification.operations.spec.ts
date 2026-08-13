import { db } from "../db";
import { OpportunityVerificationService } from "./opportunity-verification.service";

jest.mock("../db", () => ({
  db: { execute: jest.fn() },
}));

const mockedDb = db as unknown as { execute: jest.Mock };

describe("submission verification recovery operations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a bounded retry after a post-commit verifier failure", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-1",
            opportunity_id: "opportunity-1",
            status: "running",
            attempt_count: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new OpportunityVerificationService({} as any);
    jest
      .spyOn(service, "verifyOne")
      .mockRejectedValue(new Error("upstream verifier unavailable"));

    const result =
      await service.processSubmissionVerificationOperation("operation-1");

    expect(result.state).toBe("approved_for_verification");
    expect(result).toHaveProperty("retryAt");
    expect(mockedDb.execute).toHaveBeenCalledTimes(2);
  });

  it("marks exhaustion and emits a durable operational alert", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-2",
            opportunity_id: "opportunity-2",
            status: "running",
            attempt_count: 3,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new OpportunityVerificationService(
      {} as any,
      undefined,
      audit as any,
    );
    jest.spyOn(service, "verifyOne").mockRejectedValue(new Error("permanent"));

    const result =
      await service.processSubmissionVerificationOperation("operation-2");

    expect(result).toMatchObject({
      state: "approved_for_verification",
      exhausted: true,
    });
    expect(audit.log).toHaveBeenCalledWith(
      "opportunity.verification.exhausted",
      "system",
      "opportunity_verification_operation",
      expect.objectContaining({ operationId: "operation-2", attempts: 3 }),
    );
  });

  it("reclaims an expired running lease and sends it through retry to critical exhaustion", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ id: "operation-stale" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-stale",
            opportunity_id: "opportunity-stale",
            status: "running",
            attempt_count: 3,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new OpportunityVerificationService(
      {} as any,
      undefined,
      audit as any,
    );
    const verifyOne = jest
      .spyOn(service, "verifyOne")
      .mockRejectedValue(new Error("crashed worker recovered"));

    await service.runDueSubmissionVerificationOperations();

    expect(verifyOne).toHaveBeenCalledWith("opportunity-stale");
    expect(audit.log).toHaveBeenCalledWith(
      "opportunity.verification.exhausted",
      "system",
      "opportunity_verification_operation",
      expect.objectContaining({ operationId: "operation-stale", attempts: 3 }),
    );
  });
});
