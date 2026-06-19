import { NotFoundException } from "@nestjs/common";
import { db } from "../db";
import { roadmaps } from "../db/schema";
import { RoadmapsService } from "./roadmaps.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("../ai", () => ({
  AiService: class AiService {},
}));

const mockedDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const collectSqlText = (expression: any): string => {
  if (!expression?.queryChunks) return "";

  return expression.queryChunks
    .map((chunk: any) => {
      if (Array.isArray(chunk?.value)) return chunk.value.join("");
      return collectSqlText(chunk);
    })
    .join("");
};

const hasQueryChunk = (expression: any, expected: unknown): boolean => {
  if (!expression?.queryChunks) return false;

  return expression.queryChunks.some(
    (chunk: any) => chunk === expected || hasQueryChunk(chunk, expected),
  );
};

const expectFeaturedFirstOrder = (orderBy: jest.Mock) => {
  const [firstOrder] = orderBy.mock.calls[0];
  const sqlText = collectSqlText(firstOrder);

  expect(hasQueryChunk(firstOrder, roadmaps.isFeatured)).toBe(true);
  expect(sqlText).toContain("case when");
  expect(sqlText).toContain("then 1 else 0 end");
  expect(sqlText).toContain(" desc");
};

describe("RoadmapsService", () => {
  let service: RoadmapsService;
  const aiService = { generateJson: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RoadmapsService(aiService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("orders featured published roadmaps first in public listings", async () => {
    const offset = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ offset });
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValue({ from });

    await service.findAll();

    expect(orderBy).toHaveBeenCalledTimes(1);
    expectFeaturedFirstOrder(orderBy);
  });

  it("lists only published roadmap templates with steps", async () => {
    const findAll = jest.spyOn(service, "findAll").mockResolvedValue([
      { id: "template-1", steps: [{ id: "step-1" }] },
      { id: "empty-roadmap", steps: [] },
      { id: "missing-steps" },
    ] as any);

    const result = await service.findTemplates({
      category: "career",
      limit: 10,
    });

    expect(findAll).toHaveBeenCalledWith({
      category: "career",
      limit: 10,
      status: "published",
    });
    expect(result).toEqual([{ id: "template-1", steps: [{ id: "step-1" }] }]);
  });

  it("orders featured published roadmaps first in recommendations before scoring", async () => {
    jest.spyOn(service, "getIntent").mockResolvedValue(null as any);
    const limit = jest.fn().mockResolvedValue([]);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValue({ from });

    await service.getRecommendedRoadmaps("user-1");

    expect(orderBy).toHaveBeenCalledTimes(1);
    expectFeaturedFirstOrder(orderBy);
  });

  it("rejects enrollments for non-published roadmaps", async () => {
    const rejection = new NotFoundException("Roadmap not found");
    const findPublishedById = jest
      .spyOn(service, "findPublishedById")
      .mockRejectedValue(rejection);

    await expect(service.enroll("user-1", "draft-roadmap")).rejects.toBe(
      rejection,
    );

    expect(findPublishedById).toHaveBeenCalledWith("draft-roadmap");
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it("rejects adoption for non-published roadmaps", async () => {
    const rejection = new NotFoundException("Roadmap not found");
    const findPublishedById = jest
      .spyOn(service, "findPublishedById")
      .mockRejectedValue(rejection);

    await expect(service.adopt("user-1", "draft-roadmap", {})).rejects.toBe(
      rejection,
    );

    expect(findPublishedById).toHaveBeenCalledWith("draft-roadmap");
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it("rejects progress updates for non-published roadmaps before reading enrollment", async () => {
    const rejection = new NotFoundException("Roadmap not found");
    const findPublishedById = jest
      .spyOn(service, "findPublishedById")
      .mockRejectedValue(rejection);

    await expect(
      service.updateProgress("user-1", "draft-roadmap", "step-1", true),
    ).rejects.toBe(rejection);

    expect(findPublishedById).toHaveBeenCalledWith("draft-roadmap");
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
  });
});
