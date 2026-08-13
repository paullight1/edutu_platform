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
            lease_token: "11111111-1111-4111-8111-111111111111",
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
            lease_token: "22222222-2222-4222-8222-222222222222",
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
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-stale",
            opportunity_id: "opportunity-stale",
            status: "running",
            attempt_count: 3,
            lease_token: "33333333-3333-4333-8333-333333333333",
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

  it("fences a late old worker after reclaim so only the replacement can exhaust", async () => {
    let releaseOldWorker!: (value: { status: string }) => void;
    const oldWorkerResult = new Promise<{ status: string }>((resolve) => {
      releaseOldWorker = resolve;
    });
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-fenced",
            opportunity_id: "opportunity-fenced",
            status: "running",
            attempt_count: 2,
            lease_token: "44444444-4444-4444-8444-444444444444",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "operation-fenced" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-fenced",
            opportunity_id: "opportunity-fenced",
            status: "running",
            attempt_count: 3,
            lease_token: "55555555-5555-4555-8555-555555555555",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new OpportunityVerificationService(
      {} as any,
      undefined,
      audit as any,
    );
    const verifyOne = jest
      .spyOn(service, "verifyOne")
      .mockImplementationOnce(() => oldWorkerResult as any)
      .mockRejectedValueOnce(new Error("replacement failed"));

    const oldWorker =
      service.processSubmissionVerificationOperation("operation-fenced");
    await new Promise((resolve) => setImmediate(resolve));
    await service.runDueSubmissionVerificationOperations();
    releaseOldWorker({ status: "verified" });
    const oldResult = await oldWorker;

    expect(verifyOne).toHaveBeenCalledTimes(2);
    expect(oldResult.state).toBe("approved_for_verification");
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      "opportunity.verification.exhausted",
      "system",
      "opportunity_verification_operation",
      expect.objectContaining({ operationId: "operation-fenced", attempts: 3 }),
    );
  });

  it("fences a late old-worker failure after the replacement succeeds", async () => {
    let releaseOldWorker!: (error: Error) => void;
    const oldWorkerResult = new Promise<never>((_, reject) => {
      releaseOldWorker = reject;
    });
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-fenced-failure",
            opportunity_id: "opportunity-fenced-failure",
            status: "running",
            attempt_count: 1,
            lease_token: "66666666-6666-4666-8666-666666666666",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "operation-fenced-failure" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operation-fenced-failure",
            opportunity_id: "opportunity-fenced-failure",
            status: "running",
            attempt_count: 2,
            lease_token: "77777777-7777-4777-8777-777777777777",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new OpportunityVerificationService(
      {} as any,
      undefined,
      audit as any,
    );
    const verifyOne = jest
      .spyOn(service, "verifyOne")
      .mockImplementationOnce(() => oldWorkerResult as any)
      .mockResolvedValueOnce({ status: "verified" } as any);

    const oldWorker = service.processSubmissionVerificationOperation(
      "operation-fenced-failure",
    );
    await new Promise((resolve) => setImmediate(resolve));
    await service.runDueSubmissionVerificationOperations();
    releaseOldWorker(new Error("late old worker failure"));
    const oldResult = await oldWorker;

    expect(verifyOne).toHaveBeenCalledTimes(2);
    expect(oldResult.state).toBe("approved_for_verification");
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("reclaims no more than 25 stale operations in one recovery pass", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `stale-${index}`);
    mockedDb.execute.mockResolvedValueOnce({
      rows: ids.map((id) => ({ id })),
    });
    const service = new OpportunityVerificationService({} as any);
    const process = jest
      .spyOn(service, "processSubmissionVerificationOperation")
      .mockResolvedValue({ state: "approved_for_verification" });

    await service.runDueSubmissionVerificationOperations();

    expect(process).toHaveBeenCalledTimes(25);
    expect(process.mock.calls.map(([id]) => id)).toEqual(ids);
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });
});
