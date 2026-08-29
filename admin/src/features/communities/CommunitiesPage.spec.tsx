import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCommunityGroups: vi.fn(),
  listCreationRequests: vi.fn(),
  listTrendingCommunities: vi.fn(),
  approveCreationRequest: vi.fn(),
  rejectCreationRequest: vi.fn(),
  createPlatformCommunity: vi.fn(),
  updateCommunity: vi.fn(),
  archiveCommunity: vi.fn(),
  restoreCommunity: vi.fn(),
  replaceTrendingCommunities: vi.fn(),
}));

vi.mock("./api", () => mocks);

import CommunitiesPage from "./CommunitiesPage";

const group = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "sop-studio",
  name: "SOP Studio",
  description: "Application reviews",
  opportunityId: null,
  ownerId: "system:edutu-curated",
  visibility: "public" as const,
  joinPolicy: "open" as const,
  coverEmoji: "✍️",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 12,
  messageCount: 8,
  lastMessageAt: null,
  managementScope: "platform" as const,
  trendingRank: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

const request = {
  id: "22222222-2222-4222-8222-222222222222",
  requesterId: "user_requester",
  name: "Chevening Circle",
  description: "Applicants preparing together",
  opportunityId: null,
  visibility: "public" as const,
  joinPolicy: "open" as const,
  coverEmoji: "💬",
  coverImageResourceUrl: null,
  status: "pending" as const,
  reviewReason: null,
  reviewedBy: null,
  reviewedAt: null,
  approvedGroupId: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z",
  slotsUsed: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCommunityGroups.mockResolvedValue({
    groups: [group],
    summary: { active: 1, pending: 1, trending: 1, creatorsAtLimit: 0 },
    generatedAt: "2026-08-28T13:00:00.000Z",
  });
  mocks.listCreationRequests.mockResolvedValue({
    requests: [request],
    status: "pending",
    generatedAt: "2026-08-28T13:00:00.000Z",
  });
  mocks.listTrendingCommunities.mockResolvedValue([group]);
  mocks.approveCreationRequest.mockResolvedValue({});
  mocks.replaceTrendingCommunities.mockResolvedValue([group]);
});

describe("CommunitiesPage", () => {
  it("presents the community catalog and operational summary", async () => {
    render(<CommunitiesPage />);

    expect(
      await screen.findByRole("heading", { name: "Communities" }),
    ).toBeVisible();
    expect(screen.getByText("SOP Studio")).toBeVisible();
    const activeMetric = screen.getByText("Active communities").parentElement;
    expect(activeMetric).not.toBeNull();
    expect(within(activeMetric!).getByText("1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create community" })).toBeVisible();
  });

  it("reviews a pending request with visible slot usage", async () => {
    render(<CommunitiesPage />);
    fireEvent.click(
      await screen.findByRole("tab", { name: /Creation requests/ }),
    );

    const queue = screen.getByRole("tabpanel", {
      name: "Creation requests",
    });
    expect(within(queue).getByText("Chevening Circle")).toBeVisible();
    expect(within(queue).getByText("1 of 2 slots used")).toBeVisible();

    fireEvent.click(within(queue).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(mocks.approveCreationRequest).toHaveBeenCalledWith(request.id),
    );
  });

  it("supports keyboard-accessible Trending reordering", async () => {
    const second = { ...group, id: "33333333-3333-4333-8333-333333333333", name: "Funding Desk", trendingRank: 2 };
    mocks.listTrendingCommunities.mockResolvedValue([group, second]);
    render(<CommunitiesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "Trending" }));

    fireEvent.click(screen.getByRole("button", { name: "Move SOP Studio down" }));

    await waitFor(() =>
      expect(mocks.replaceTrendingCommunities).toHaveBeenCalledWith([
        second.id,
        group.id,
      ]),
    );
  });
});
