import { NotFoundException } from "@nestjs/common";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import { GoalsService } from "./goals.service";

jest.mock("../db", () => ({
  db: {
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  select: jest.Mock;
};

describe("GoalsService", () => {
  let service: GoalsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new GoalsService();
  });

  it("creates goals with normalized user ids and aligned deadline columns", async () => {
    const values = jest.fn();
    const returning = jest.fn().mockResolvedValue([
      {
        id: "goal-1",
        userId: toDatabaseUserId("user_clerk_123"),
        title: "Submit scholarship application",
        description: null,
        category: "Scholarship",
        progress: 0,
        status: "active",
        deadline: "2026-07-01",
        targetDate: new Date("2026-07-01T00:00:00.000Z"),
        priority: "high",
        source: "custom",
        templateId: null,
        createdAt: new Date("2026-06-19T08:00:00.000Z"),
        updatedAt: new Date("2026-06-19T08:00:00.000Z"),
        completedAt: null,
      },
    ]);

    values.mockReturnValue({ returning });
    mockedDb.insert.mockReturnValue({ values });

    const result = await service.create("user_clerk_123", {
      title: "Submit scholarship application",
      category: "Scholarship",
      deadline: "2026-07-01T00:00:00.000Z",
      priority: "high",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: toDatabaseUserId("user_clerk_123"),
        deadline: "2026-07-01",
        priority: "high",
        source: "custom",
      }),
    );
    expect(values.mock.calls[0][0].targetDate).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      id: "goal-1",
      user_id: toDatabaseUserId("user_clerk_123"),
      deadline: expect.any(Date),
      target_date: expect.any(Date),
      template_id: null,
    });
  });

  it("marks progress updates at 100 as completed", async () => {
    const set = jest.fn();
    const where = jest.fn();
    const returning = jest.fn().mockResolvedValue([
      {
        id: "goal-1",
        userId: toDatabaseUserId("user_clerk_123"),
        title: "Finish CV",
        progress: 100,
        status: "completed",
        deadline: null,
        targetDate: null,
        createdAt: new Date("2026-06-19T08:00:00.000Z"),
        updatedAt: new Date("2026-06-19T08:05:00.000Z"),
        completedAt: new Date("2026-06-19T08:05:00.000Z"),
      },
    ]);

    where.mockReturnValue({ returning });
    set.mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });

    await service.update("user_clerk_123", "goal-1", { progress: 100 });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: 100,
        status: "completed",
        completedAt: expect.any(Date),
      }),
    );
  });

  it("throws when updating a missing goal", async () => {
    const set = jest.fn();
    const where = jest.fn();
    const returning = jest.fn().mockResolvedValue([]);

    where.mockReturnValue({ returning });
    set.mockReturnValue({ where });
    mockedDb.update.mockReturnValue({ set });

    await expect(
      service.update("user_clerk_123", "missing-goal", { progress: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws when deleting a missing goal", async () => {
    const where = jest.fn();
    const returning = jest.fn().mockResolvedValue([]);

    where.mockReturnValue({ returning });
    mockedDb.delete.mockReturnValue({ where });

    await expect(
      service.remove("user_clerk_123", "missing-goal"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
