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
    const findAll = jest
      .spyOn(service, "findAll")
      .mockResolvedValue([
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
    // adopt() resolves the roadmap via findAdoptableRoadmap (which also
    // allows the creator's own unpublished roadmaps), not findPublishedById.
    const findAdoptableRoadmap = jest
      .spyOn(service as any, "findAdoptableRoadmap")
      .mockRejectedValue(rejection);

    await expect(service.adopt("user-1", "draft-roadmap", {})).rejects.toBe(
      rejection,
    );

    expect(findAdoptableRoadmap).toHaveBeenCalledWith(
      "user-1",
      "draft-roadmap",
    );
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

  describe("createAdoptionGoals", () => {
    it("creates one imported goal per dated plan step and skips empty titles", async () => {
      const create = jest.fn().mockResolvedValue({});
      const svc = new RoadmapsService(aiService as any, { create } as any);

      const count = await (svc as any).createAdoptionGoals(
        "user-1",
        { id: "rm-1", category: "scholarship" },
        {
          steps: [
            { id: "s1", title: "Draft SOP", description: "Write it", dueAt: "2026-08-01T09:00:00.000Z" },
            { id: "s2", title: "Submit application", dueAt: null },
            { id: "s3", title: "", dueAt: "2026-08-05T09:00:00.000Z" },
          ],
        },
      );

      expect(count).toBe(2);
      expect(create).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Draft SOP",
          source: "imported",
          templateId: "rm-1",
          category: "scholarship",
          targetDate: "2026-08-01T09:00:00.000Z",
        }),
      );
      // A step with no due date still becomes a goal (no reminder date).
      expect(create).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ title: "Submit application", targetDate: undefined }),
      );
    });

    it("is a no-op when the goals service is unavailable", async () => {
      const svc = new RoadmapsService(aiService as any);
      const count = await (svc as any).createAdoptionGoals("user-1", { id: "rm-1" }, {
        steps: [{ id: "s1", title: "Draft SOP" }],
      });
      expect(count).toBe(0);
    });

    it("continues past a failing goal creation and counts the rest", async () => {
      const create = jest
        .fn()
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce({});
      const svc = new RoadmapsService(aiService as any, { create } as any);

      const count = await (svc as any).createAdoptionGoals(
        "user-1",
        { id: "rm-1" },
        { steps: [{ id: "s1", title: "First" }, { id: "s2", title: "Second" }] },
      );

      expect(count).toBe(1);
    });
  });

  describe("generateOpportunityPlan", () => {
    it("returns AI-enriched content aligned to the provided milestone scaffold", async () => {
      aiService.generateJson.mockResolvedValue({
        summary: "Win the Chevening scholarship with a focused plan.",
        winningStrategy: "Lead with measurable impact and a clear study plan.",
        milestones: [
          { id: "m2", title: "Gather your evidence", description: "Collect transcripts and references early." },
          { id: "m1", title: "Understand the criteria", description: "Map exactly what the panel rewards." },
        ],
        checklist: ["Transcripts", "Two references", "", 42],
        supportActions: ["Find an alumnus to review your essays"],
      });

      const result = await service.generateOpportunityPlan({
        title: "Chevening Scholarship",
        organization: "UK Government",
        category: "scholarship",
        milestones: [
          { id: "m1", title: "Confirm fit" },
          { id: "m2", title: "Collect proof" },
        ],
      });

      expect(result.generatedBy).toBe("ai");
      // Realigned to scaffold order by id, not the AI response order.
      expect(result.milestones.map((m) => m.id)).toEqual(["m1", "m2"]);
      expect(result.milestones[0].description).toContain("panel rewards");
      // Non-string / empty checklist entries are filtered out.
      expect(result.checklist).toEqual(["Transcripts", "Two references"]);
    });

    it("falls back to a deterministic plan when the AI response is unusable", async () => {
      aiService.generateJson.mockResolvedValue({ summary: "", milestones: [] });

      const result = await service.generateOpportunityPlan({
        title: "MTN Foundation Scholarship",
        category: "scholarship",
        deadline: "2026-09-01",
      });

      expect(result.generatedBy).toBe("fallback");
      expect(result.milestones).toHaveLength(5);
      expect(result.winningStrategy).toContain("deadline");
      expect(result.checklist.length).toBeGreaterThan(0);
    });

    it("falls back when the AI provider throws", async () => {
      aiService.generateJson.mockRejectedValue(new Error("provider down"));

      const result = await service.generateOpportunityPlan({
        title: "Google Internship",
        category: "tech",
      });

      expect(result.generatedBy).toBe("fallback");
      expect(result.milestones).toHaveLength(5);
    });
  });
});
