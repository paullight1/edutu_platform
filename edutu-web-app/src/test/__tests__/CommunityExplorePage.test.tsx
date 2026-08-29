import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupWithMembership } from "../../features/community/types";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  getDiscovery: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
    userId: "user-member",
  }),
}));

vi.mock("../../features/community/api", () => ({
  CommunityApi: class {
    getDiscovery = mocks.getDiscovery;
  },
  isCommunityApiError: () => false,
}));

import CommunityExplorePage from "../../features/community/CommunityExplorePage";

function community(
  id: string,
  name: string,
  memberCount: number,
  messageCount: number,
): GroupWithMembership {
  return {
    group: {
      id,
      slug: id,
      name,
      description: `${name} community`,
      opportunityId: null,
      ownerId: "user-owner",
      visibility: "public",
      joinPolicy: "open",
      coverEmoji: "💬",
      coverImageResourceUrl: null,
      accent: null,
      expiresAt: null,
      archivedAt: null,
      memberCount,
      messageCount,
      lastMessageAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    membership: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDiscovery.mockResolvedValue({
    trending: [
      community("editor-first", "Editor First", 1, 0),
      community("editor-second", "Editor Second", 1, 0),
      community("editor-third", "Editor Third", 1, 0),
    ],
    communities: [community("high-activity", "High Activity", 100, 100)],
  });
});

describe("CommunityExplorePage", () => {
  it("keeps every admin-curated community in its saved Trending order", async () => {
    render(
      <MemoryRouter initialEntries={["/app/community/explore"]}>
        <CommunityExplorePage />
      </MemoryRouter>,
    );

    const trending = await screen.findByRole("region", { name: "Trending" });
    const trendingLinks = within(trending).getAllByRole("link");

    expect(trendingLinks).toHaveLength(3);
    expect(trendingLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Open Editor First",
      "Open Editor Second",
      "Open Editor Third",
    ]);

    const more = screen.getByRole("region", { name: "More communities" });
    expect(
      within(more).getByRole("link", { name: "Open High Activity" }),
    ).toBeVisible();
    expect(
      within(more).queryByRole("link", { name: "Open Editor First" }),
    ).not.toBeInTheDocument();
  });
});
