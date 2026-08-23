import { ScraperSourceAdminService } from "./scraper-source-admin.service";

function sourceStore() {
  const single = jest.fn().mockResolvedValue({
    data: { id: 7, name: "DAAD", url: "https://www.daad.de/" },
    error: null,
  });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const updateEq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq: updateEq });
  const deleteEq = jest.fn().mockResolvedValue({ error: null });
  const remove = jest.fn().mockReturnValue({ eq: deleteEq });
  const order = jest.fn().mockResolvedValue({ data: [], error: null });
  const list = jest.fn().mockReturnValue({ order });
  const from = jest.fn().mockReturnValue({
    insert,
    update,
    delete: remove,
    select: list,
  });

  return {
    client: { from } as any,
    from,
    insert,
    update,
    updateEq,
  };
}

describe("ScraperSourceAdminService", () => {
  it("creates a source with the crawler configuration needed for official scholarship sites", async () => {
    const store = sourceStore();
    const service = new ScraperSourceAdminService(store.client);

    await expect(
      service.addSource({
        name: "DAAD Scholarships",
        url: "https://www.daad.de/en/studying-in-germany/scholarships/",
        category: "scholarship",
        tier: 1,
        priority: 2,
        enabled: true,
        config: {
          item_selector: "article.scholarship",
          title_selector: "h2",
          link_selector: "a[href]",
          content_selectors: ["main", "article"],
        },
      }),
    ).resolves.toMatchObject({ success: true });

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "DAAD Scholarships",
        category: "scholarship",
        tier: 1,
        priority: 2,
        enabled: true,
        config: expect.objectContaining({
          item_selector: "article.scholarship",
          title_selector: "h2",
        }),
      }),
    );
  });

  it("supports patching source policy/config instead of only toggling enabled", async () => {
    const store = sourceStore();
    const service = new ScraperSourceAdminService(store.client);

    await expect(
      service.updateSource(7, {
        enabled: true,
        priority: 1,
        tier: 1,
        category: "scholarship",
        config: {
          item_selector: "article",
          next_page_selector: "a.next",
        },
      }),
    ).resolves.toEqual({ success: true, error: undefined });

    expect(store.update).toHaveBeenCalledWith({
      enabled: true,
      priority: 1,
      tier: 1,
      category: "scholarship",
      config: {
        item_selector: "article",
        next_page_selector: "a.next",
      },
    });
  });

  it("rejects unsafe source URLs before touching storage", async () => {
    const store = sourceStore();
    const service = new ScraperSourceAdminService(store.client);

    await expect(
      service.addSource({
        name: "Internal metadata",
        url: "http://169.254.169.254/latest/meta-data",
      }),
    ).resolves.toMatchObject({ success: false });

    expect(store.insert).not.toHaveBeenCalled();
  });

  it("uses a unique synthetic URL for source groups", async () => {
    const store = sourceStore();
    const service = new ScraperSourceAdminService(store.client);

    await service.addSource({
      name: "Official Government Scholarships",
      is_group: true,
    });

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "group://official-government-scholarships",
        is_group: true,
      }),
    );
  });

  it("fails closed when the source store is not configured", async () => {
    const service = new ScraperSourceAdminService(null);

    await expect(service.updateSource(7, { enabled: false })).resolves.toEqual({
      success: false,
      error: "No database configured",
    });
  });
});
