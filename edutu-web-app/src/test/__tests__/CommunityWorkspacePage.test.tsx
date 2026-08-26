import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  fetchGroups: vi.fn(),
  joinGroup: vi.fn(),
  fetchDmConversations: vi.fn(),
  fetchDmRequests: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({ getToken: mocks.getToken, userId: "user_me" }),
  useAuth: () => ({
    user: { id: "user_me", name: "Amina Bello", email: "amina@example.com" },
  }),
}));

vi.mock("../../services/community", async () => {
  const actual = await vi.importActual<typeof import("../../services/community")>(
    "../../services/community",
  );
  return {
    ...actual,
    fetchGroups: mocks.fetchGroups,
    joinGroup: mocks.joinGroup,
    createGroup: vi.fn(),
  };
});

vi.mock("../../services/communityDms", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/communityDms")
  >("../../services/communityDms");
  return {
    ...actual,
    fetchDmConversations: mocks.fetchDmConversations,
    fetchDmRequests: mocks.fetchDmRequests,
  };
});

import CommunityWorkspacePage from "../../components/CommunityWorkspacePage";

const group = {
  id: "group-1",
  slug: "scholarship-builders",
  name: "Scholarship Builders",
  description: "Review applications with focused peers.",
  opportunityId: null,
  ownerId: "user_owner",
  visibility: "private" as const,
  joinPolicy: "open" as const,
  coverEmoji: "🎓",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 18,
  messageCount: 64,
  lastMessageAt: "2026-08-22T12:00:00.000Z",
  createdAt: "2026-08-01T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue("clerk-token");
  mocks.fetchGroups.mockResolvedValue([
    {
      group,
      membership: {
        id: "membership-1",
        groupId: group.id,
        userId: "user_me",
        role: "member",
        status: "invited",
        joinedAt: "2026-08-22T12:00:00.000Z",
      },
    },
  ]);
  mocks.fetchDmConversations.mockResolvedValue([]);
  mocks.fetchDmRequests.mockResolvedValue([]);
  mocks.joinGroup.mockResolvedValue({
    status: "active",
    groupId: group.id,
    membership: {
      id: "membership-1",
      groupId: group.id,
      userId: "user_me",
      role: "member",
      status: "active",
      joinedAt: "2026-08-22T12:00:00.000Z",
    },
    request: null,
  });
});

describe("CommunityWorkspacePage", () => {
  it("separates discovery, groups and messages and renders invitations safely", async () => {
    render(
      <MemoryRouter>
        <CommunityWorkspacePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Community" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Discover" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Your groups" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Messages" })).toBeInTheDocument();

    expect(await screen.findByText("Scholarship Builders")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept invite to Scholarship Builders" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join Scholarship Builders" }),
    ).not.toBeInTheDocument();
  });

  it("accepts an invitation through the existing join contract", async () => {
    render(
      <MemoryRouter>
        <CommunityWorkspacePage />
      </MemoryRouter>,
    );

    const accept = await screen.findByRole("button", {
      name: "Accept invite to Scholarship Builders",
    });
    fireEvent.click(accept);

    await waitFor(() => {
      expect(mocks.joinGroup).toHaveBeenCalledWith(group.id, [], mocks.getToken);
    });
    expect(await screen.findByText("Invitation accepted.")).toBeInTheDocument();
  });
});
