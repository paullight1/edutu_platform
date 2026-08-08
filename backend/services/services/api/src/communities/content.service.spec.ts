import {
  CommunityContentService,
  mapCommunityProfileContentRow,
} from "./content.service";

describe("mapCommunityProfileContentRow", () => {
  it("normalizes legacy post metadata without trusting unsafe resource URLs", () => {
    const item = mapCommunityProfileContentRow({
      source: "post",
      id: "f58c0719-f518-4c76-9b79-ab652b637953",
      created_at: "2026-08-08T10:00:00.000Z",
      row_data: {
        title: "My application roadmap",
        likes: 4,
        metadata: {
          category: "Scholarships",
          resources: [
            {
              id: "safe",
              title: "Official guide",
              url: "https://example.com/guide",
            },
            { id: "unsafe", title: "Run this", url: "javascript:alert(1)" },
          ],
        },
      },
    });

    expect(item).toMatchObject({
      title: "My application roadmap",
      category: "Scholarships",
      likes: 4,
    });
    expect(item.resources[0]?.url).toBe("https://example.com/guide");
    expect(item.resources[1]?.url).toBeNull();
  });
});

describe("CommunityContentService cursor validation", () => {
  it("rejects an invalid cursor id before it reaches Postgres", async () => {
    const service = new CommunityContentService();

    await expect(
      service.listMine("user_123", {
        before: new Date("2026-08-08T10:00:00.000Z"),
        beforeId: "not-a-uuid",
      }),
    ).rejects.toThrow("That page of community content isn't valid.");
  });
});
