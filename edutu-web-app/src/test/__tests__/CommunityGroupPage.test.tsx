import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  fetchGroup: vi.fn(),
  fetchMessages: vi.fn(),
  fetchGroupResources: vi.fn(),
  fetchGroupMembers: vi.fn(),
  fetchJoinRequests: vi.fn(),
  fetchGroupForm: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({ getToken: mocks.getToken, userId: "user_me" }),
  useAuth: () => ({ user: { id: "user_me", name: "Amina Bello", email: "amina@example.com" } }),
}));

vi.mock("../../services/community", async () => {
  const actual = await vi.importActual<typeof import("../../services/community")>("../../services/community");
  return {
    ...actual,
    fetchGroup: mocks.fetchGroup,
    fetchMessages: mocks.fetchMessages,
    fetchGroupResources: mocks.fetchGroupResources,
    fetchGroupMembers: mocks.fetchGroupMembers,
    fetchJoinRequests: mocks.fetchJoinRequests,
    fetchGroupForm: mocks.fetchGroupForm,
    sendMessage: mocks.sendMessage,
  };
});

import CommunityGroupPage from "../../components/CommunityGroupPage";

const group = {
  id: "group-1", slug: "scholarship-builders", name: "Scholarship Builders",
  description: "Review applications with focused peers.", opportunityId: null,
  ownerId: "user_owner", visibility: "public" as const, joinPolicy: "open" as const,
  coverEmoji: "🎓", coverImageResourceUrl: null, accent: null, expiresAt: null,
  archivedAt: null, memberCount: 18, messageCount: 64,
  lastMessageAt: "2026-08-22T12:00:00.000Z", createdAt: "2026-08-01T12:00:00.000Z",
};

const member = {
  membership: {
    id: "membership-2",
    groupId: group.id,
    userId: "user_other",
    role: "member",
    status: "active",
    joinedAt: "2026-08-20T12:00:00.000Z",
  },
  profile: { displayName: "Tomi Ade", avatarUrl: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue("clerk-token");
  mocks.fetchGroup.mockResolvedValue({ group, membership: { id: "membership-1", groupId: group.id, userId: "user_me", role: "member", status: "active", joinedAt: "2026-08-22T12:00:00.000Z" } });
  mocks.fetchMessages.mockResolvedValue([{ id: "message-1", groupId: group.id, userId: "user_other", body: "I added a checklist for the essay review.", kind: "text", opportunityId: null, createdAt: "2026-08-22T12:00:00.000Z", deletedAt: null, deletedBy: null, author: { displayName: "Tomi Ade", avatarUrl: null } }]);
  mocks.fetchGroupResources.mockResolvedValue({ resources: [], nextCursor: null });
  mocks.fetchGroupMembers.mockResolvedValue({ members: [member], hasMore: false });
  mocks.fetchJoinRequests.mockResolvedValue([]);
  mocks.fetchGroupForm.mockResolvedValue({ questions: [] });
  mocks.sendMessage.mockResolvedValue({ id: "message-2", groupId: group.id, userId: "user_me", body: "Great — I will review it tonight.", kind: "text", opportunityId: null, createdAt: "2026-08-22T12:01:00.000Z", deletedAt: null, deletedBy: null, author: { displayName: "Amina Bello", avatarUrl: null } });
});

function renderGroup() {
  return render(<MemoryRouter initialEntries={["/app/community/groups/group-1"]}><Routes><Route path="/app/community/groups/:groupId" element={<CommunityGroupPage />} /></Routes></MemoryRouter>);
}

describe("CommunityGroupPage", () => {
  it("renders chat, resources and members without any browser voice-call control", async () => {
    renderGroup();
    expect(await screen.findByRole("heading", { name: "Scholarship Builders" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    expect(await screen.findByText("I added a checklist for the essay review.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/start call/i)).not.toBeInTheDocument();
  });

  it("sends a text message through the native form REST contract", async () => {
    renderGroup();
    const composer = await screen.findByRole("textbox", { name: "Message Scholarship Builders" }) as HTMLTextAreaElement;
    composer.value = "Great — I will review it tonight.";
    const form = composer.closest("form");
    expect(form).not.toBeNull();
    expect(new FormData(form!).get("message")).toBe(
      "Great — I will review it tonight.",
    );

    fireEvent.submit(form!);

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith(
        group.id,
        { body: "Great — I will review it tonight." },
        mocks.getToken,
      ),
    );
    expect(await screen.findByText("Great — I will review it tonight.")).toBeInTheDocument();
  });

  it("loads earlier messages with the backend before plus beforeId cursor", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `message-${index}`,
      groupId: group.id,
      userId: "user_other",
      body: `Message ${index}`,
      kind: "text",
      opportunityId: null,
      createdAt: new Date(Date.UTC(2026, 7, 22, 12, index)).toISOString(),
      deletedAt: null,
      deletedBy: null,
      author: { displayName: "Tomi Ade", avatarUrl: null },
    }));
    const older = {
      ...firstPage[0],
      id: "message-older",
      body: "An earlier message",
      createdAt: "2026-08-22T11:59:00.000Z",
    };
    mocks.fetchMessages
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([older]);

    renderGroup();
    const loadEarlier = await screen.findByRole("button", { name: "Load earlier messages" });
    fireEvent.click(loadEarlier);

    await waitFor(() =>
      expect(mocks.fetchMessages).toHaveBeenNthCalledWith(
        2,
        group.id,
        {
          before: firstPage[0].createdAt,
          beforeId: firstPage[0].id,
          limit: 50,
        },
        mocks.getToken,
      ),
    );
    expect(await screen.findByText("An earlier message")).toBeInTheDocument();
  });

  it("does not expose owner-only role controls to a moderator", async () => {
    const peerModerator = {
      membership: {
        id: "membership-3",
        groupId: group.id,
        userId: "user_peer_mod",
        role: "mod",
        status: "active",
        joinedAt: "2026-08-21T12:00:00.000Z",
      },
      profile: { displayName: "Kemi Lawal", avatarUrl: null },
    };
    mocks.fetchGroup.mockResolvedValue({
      group,
      membership: {
        id: "membership-1",
        groupId: group.id,
        userId: "user_me",
        role: "mod",
        status: "active",
        joinedAt: "2026-08-22T12:00:00.000Z",
      },
    });
    mocks.fetchGroupMembers.mockResolvedValue({
      members: [member, peerModerator],
      hasMore: false,
    });

    renderGroup();
    fireEvent.click(await screen.findByRole("tab", { name: "Admin" }));
    expect(await screen.findByRole("heading", { name: "Member controls" })).toBeInTheDocument();

    expect(screen.queryByRole("combobox", { name: "Role for Tomi Ade" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Role for Kemi Lawal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Tomi Ade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Kemi Lawal" })).not.toBeInTheDocument();
  });
});
