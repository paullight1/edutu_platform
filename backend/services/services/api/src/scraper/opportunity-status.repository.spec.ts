import { OpportunityStatusRepository } from "./opportunity-status.repository";

describe("OpportunityStatusRepository", () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function repositoryWithRows(rows: unknown[] = [], error: unknown = null) {
    const inQuery = jest.fn().mockResolvedValue({ data: rows, error });
    const select = jest.fn().mockReturnValue({ in: inQuery });
    const from = jest.fn().mockReturnValue({ select });
    const repository = new OpportunityStatusRepository(
      () => ({ from }) as any,
      logger,
    );
    return { repository, from, select, inQuery };
  }

  it("does not query for an empty URL list", async () => {
    const { repository, from } = repositoryWithRows();

    await expect(repository.findByCanonicalUrls([])).resolves.toEqual(
      new Map(),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("queries canonical URLs in chunks and omits incomplete rows", async () => {
    const { repository, inQuery } = repositoryWithRows([
      { canonical_url: "https://example.com/a", status: "active" },
      { canonical_url: null, status: "closed" },
      { canonical_url: "https://example.com/c", status: null },
    ]);
    const urls = Array.from(
      { length: 201 },
      (_, index) => `https://example.com/${index}`,
    );

    await expect(repository.findByCanonicalUrls(urls)).resolves.toEqual(
      new Map([["https://example.com/a", "active"]]),
    );
    expect(inQuery).toHaveBeenCalledTimes(2);
    expect(inQuery.mock.calls[0][1]).toHaveLength(200);
    expect(inQuery.mock.calls[1][1]).toHaveLength(1);
  });

  it("fails open when Supabase returns an error", async () => {
    const { repository } = repositoryWithRows([], { message: "database down" });

    await expect(
      repository.findByCanonicalUrls(["https://example.com/a"]),
    ).resolves.toEqual(new Map());
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("database down"),
    );
  });
});
