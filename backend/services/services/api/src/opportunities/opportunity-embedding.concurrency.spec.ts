import { db } from "../db";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

describe("OpportunityEmbeddingService concurrency", () => {
  const mockedDb = db as unknown as {
    select: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            execute: async () => [{ title: "Scholarship" }],
          }),
        }),
      }),
    }));
    mockedDb.execute.mockResolvedValue(undefined);
  });

  it("serializes opportunity embeddings and deduplicates the same in-flight row", async () => {
    let active = 0;
    let maxActive = 0;
    const aiService = {
      embed: jest.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          embeddings: [[0.1, 0.2, 0.3]],
          model: "text-embedding-004",
        };
      }),
    };
    const service = new OpportunityEmbeddingService(aiService as any);

    await expect(
      Promise.all([
        service.embedOpportunity("opp-1"),
        service.embedOpportunity("opp-1"),
        service.embedOpportunity("opp-2"),
      ]),
    ).resolves.toEqual([true, true, true]);

    expect(aiService.embed).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });
});
