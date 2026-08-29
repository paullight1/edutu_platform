import { beforeEach, describe, expect, it, vi } from "vitest";
import { productApiRequest } from "./productApi";
import {
  addBookmark,
  getBookmarks,
  removeBookmark,
  type BookmarkOpportunity,
} from "./bookmarks";

vi.mock("./productApi", () => ({
  productApiRequest: vi.fn(),
}));

const mockedProductApiRequest = vi.mocked(productApiRequest);
const userId = "user_bookmark_test";
const token = "clerk-token";
const opportunity: BookmarkOpportunity = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Scholarship for builders",
  category: "Scholarship",
  deadline: "2026-09-30T00:00:00.000Z",
  location: "Remote",
  match_percentage: 84,
};

const restriction = new Error(
  "Service for this project is restricted due to the following violations: exceed_storage_size_quota.",
);

describe("bookmark storage fallback", () => {
  beforeEach(() => {
    mockedProductApiRequest.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("keeps a bookmark usable locally while Supabase is restricted", async () => {
    mockedProductApiRequest.mockRejectedValueOnce(restriction);

    const saved = await addBookmark(userId, opportunity, token);
    const bookmarks = await getBookmarks(userId, token);

    expect(saved).toMatchObject({
      opportunity_id: opportunity.id,
      opportunity_title: opportunity.title,
    });
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toMatchObject({
      opportunity_id: opportunity.id,
      opportunity_title: opportunity.title,
    });
  });

  it("removes a locally saved bookmark while the API circuit is open", async () => {
    mockedProductApiRequest.mockRejectedValueOnce(restriction);
    await addBookmark(userId, opportunity, token);

    await expect(removeBookmark(userId, opportunity.id, token)).resolves.toBe(true);
    await expect(getBookmarks(userId, token)).resolves.toEqual([]);
  });

  it("synchronizes a queued bookmark after the restriction clears", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T20:00:00.000Z"));
    mockedProductApiRequest.mockRejectedValueOnce(restriction);
    await addBookmark(userId, opportunity, token);

    vi.setSystemTime(new Date("2026-08-27T20:06:00.000Z"));
    mockedProductApiRequest
      .mockResolvedValueOnce({
        id: "bookmark-1",
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        opportunityCategory: opportunity.category,
        opportunityDeadline: opportunity.deadline,
        opportunityLocation: opportunity.location,
        matchPercentage: opportunity.match_percentage,
        createdAt: "2026-08-27T20:06:00.000Z",
      })
      .mockResolvedValueOnce([
        {
          id: "bookmark-1",
          opportunityId: opportunity.id,
          opportunityTitle: opportunity.title,
          opportunityCategory: opportunity.category,
          opportunityDeadline: opportunity.deadline,
          opportunityLocation: opportunity.location,
          matchPercentage: opportunity.match_percentage,
          createdAt: "2026-08-27T20:06:00.000Z",
        },
      ]);

    const bookmarks = await getBookmarks(userId, token);

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].id).toBe("bookmark-1");
  });
});
