import { ScrapedUrlIndexRepository } from "./scraped-url-index.repository";

describe("ScrapedUrlIndexRepository", () => {
  const logger = { warn: jest.fn() };
  const normalizeUrl = (value: string) => value.trim().replace(/\/$/, "");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deduplicates normalized discovered URLs before upsert", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ upsert });
    const repository = new ScrapedUrlIndexRepository(
      () => ({ from }) as any,
      normalizeUrl,
      logger,
    );

    await repository.recordDiscovered({ id: 7, name: "Example" }, [
      { apply_url: "https://example.com/apply/" },
      { apply_url: "https://example.com/apply" },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          url: "https://example.com/apply",
          source_id: 7,
          status: "pending",
        }),
      ],
      { onConflict: "url", ignoreDuplicates: false },
    );
  });

  it("skips only recently processed items whose opportunity still exists", async () => {
    const scrapedUrlsIn = jest.fn().mockResolvedValue({
      data: [
        {
          url: "https://example.com/known",
          status: "processed",
          last_checked: new Date().toISOString(),
        },
      ],
      error: null,
    });
    const opportunityIn = jest.fn().mockResolvedValue({
      data: [{ apply_url: "https://example.com/known" }],
      error: null,
    });
    const from = jest.fn((table: string) => {
      const inQuery = table === "scraped_urls" ? scrapedUrlsIn : opportunityIn;
      return { select: jest.fn().mockReturnValue({ in: inQuery }) };
    });
    const repository = new ScrapedUrlIndexRepository(
      () => ({ from }) as any,
      normalizeUrl,
      logger,
    );
    const known = { apply_url: "https://example.com/known" };
    const newItem = { apply_url: "https://example.com/new" };

    await expect(
      repository.partitionKnown([known, newItem], 3),
    ).resolves.toEqual({
      fresh: [newItem],
      skipped: [known],
    });
  });

  it("fails open when the URL index cannot be read", async () => {
    const inQuery = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "read failure" },
    });
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ in: inQuery }),
    });
    const repository = new ScrapedUrlIndexRepository(
      () => ({ from }) as any,
      normalizeUrl,
      logger,
    );
    const item = { apply_url: "https://example.com/apply" };

    await expect(repository.partitionKnown([item], 3)).resolves.toEqual({
      fresh: [item],
      skipped: [],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("read failure"),
    );
  });
});
