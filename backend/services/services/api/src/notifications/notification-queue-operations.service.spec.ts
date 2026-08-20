import { db } from "../db";
import { NotificationQueueOperationsService } from "./notification-queue-operations.service";

jest.mock("../db", () => ({
  db: {
    execute: jest.fn(),
  },
}));

const execute = (db as unknown as { execute: jest.Mock }).execute;

describe("NotificationQueueOperationsService", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("returns queue health with dead-letter and stale-processing visibility", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          pending_count: "4",
          processing_count: "2",
          dead_letter_count: "3",
          retrying_count: "1",
          stale_processing_count: "1",
          oldest_pending_seconds: "95",
        },
      ],
    });

    const service = new NotificationQueueOperationsService();
    await expect(service.getHealth()).resolves.toEqual({
      pending: 4,
      processing: 2,
      deadLetter: 3,
      retrying: 1,
      staleProcessing: 1,
      oldestPendingSeconds: 95,
      healthy: false,
    });
  });

  it("treats an empty queue as healthy", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          pending_count: "0",
          processing_count: "0",
          dead_letter_count: "0",
          retrying_count: "0",
          stale_processing_count: "0",
          oldest_pending_seconds: null,
        },
      ],
    });

    const service = new NotificationQueueOperationsService();
    await expect(service.getHealth()).resolves.toMatchObject({
      healthy: true,
      deadLetter: 0,
      staleProcessing: 0,
    });
  });

  it("delegates stale lease recovery to the database-owned retry policy", async () => {
    execute.mockResolvedValue({ rows: [{ recovered: 2 }] });

    const service = new NotificationQueueOperationsService();
    await expect(service.recoverStaleProcessing()).resolves.toEqual({
      recovered: 2,
    });
  });
});
