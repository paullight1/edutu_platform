import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.edutu.test",
}));

import {
  fetchAllPublishedPosts,
  fetchPublishedPosts,
  type BlogPost,
} from "./blog";

function post(id: number): BlogPost {
  return {
    id: `post-${id}`,
    title: `Guide ${id}`,
    slug: `guide-${id}`,
    content: `Guide ${id} content`,
    excerpt: `Guide ${id} excerpt`,
    coverImage: null,
    status: "published",
    authorId: "edutu",
    authorName: "Edutu Editorial Team",
    authorAvatar: null,
    category: "Scholarships",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-08-01T00:00:00.000Z",
    tags: [],
    featured: false,
    views: 0,
    likes: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchPublishedPosts", () => {
  it("passes an explicit offset to the public blog API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPublishedPosts({ limit: 12, offset: 24 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("limit=12");
    expect(url).toContain("offset=24");
  });
});

describe("fetchAllPublishedPosts", () => {
  it("walks every bounded API page so hydrated archives are not capped at 60 posts", async () => {
    const pages = [[post(1), post(2)], [post(3)], []];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => pages.shift() ?? [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const posts = await fetchAllPublishedPosts({ pageSize: 2, maximum: 10 });

    expect(posts.map((item) => item.id)).toEqual(["post-1", "post-2", "post-3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("offset=");
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=2");
  });
});
