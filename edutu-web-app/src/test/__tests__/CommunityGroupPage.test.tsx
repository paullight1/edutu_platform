import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchGroup = vi.fn();
const fetchMessages = vi.fn();
const fetchGroupResources = vi.fn();
const fetchGroupMembers = vi.fn();
const sendMessage = vi.fn();

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({
    getToken: vi.fn(async () => "clerk-token"),
    userId: "user_me",
  }),
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
    fetchGroup,
    fetchMessages,
    fetchGroupResources,
    fetchGroupMembers,
    sendMessage,
  };
});

import CommunityGroupPage from "../../components/CommunityGroupPage";

const group = {
  id: "group-1",
  slug: "scholarship-builders",
  name: "Scholarship Builders",
  description: "Review applications with focused peers.",
  opportunityId: null,
  ownerId: "user_owner",
  visibility: "public" as const,
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
  fetchGroup.mockResolvedValue({
    group,
    membership: {
      id: "membership-1",
      groupId: group.id,
      userId: "user_me",
      role: "member",
      status: "active",
      joinedAt: "2026-08-22T12:00:00.000Z",
    },
  });
  fetchMessages.mockResolvedValue([
    {
      id: "message-1",
      groupId: group.id,
      userId: "user_other",
      body: "I added a checklist for the essay review.",
      kind: "text",
      opportunityId: null,
      createdAt: "2026-08-22T12:00:00.000Z",
      deletedAt: null,
      deletedBy: null,
      author: { displayName: "Tomi Ade", avatarUrl: null },
    },
  ]);
  fetchGroupResources.mockResolvedValue({ resources: [], nextCursor: null });
  fetchGroupMembers.mockResolvedValue({
    members: [
      {
        membership: {
          id: "membership-2",
          groupId: group.id,
          userId: "user_other",
          role: "member",
          status: "active",
          joinedAt: "2026-08-20T12:00:00.000Z",
        },
        profile: { displayName: "Tomi Ade", avatarUrl: null },
      },
    ],
    hasMore: false,
  });
  sendMessage.mockResolvedValue({
    id: "message-2",
    groupId: group.id,
    userId: "user_me",
    body: "Great — I will review it tonight.",
    kind: "text",
    opportunityId: null,
    createdAt: "2026-08-22T12:01:00.000Z",
    deletedAt: null,
    deletedBy: null,
    author: { displayName: "Amina Bello", avatarUrl: null },
  });
});

function renderGroup() {
  return render(
    <MemoryRouter initialEntries={["/app/community/groups/group-1"]}>
      <Routes>
        <Route
          path="/app/community/groups/:groupId"
          element={<CommunityGroupPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CommunityGroupPage", () => {
  it("renders chat, resources and members without any browser voice-call control", async () => {
    renderGroup();

    expect(
      await screen.findByRole("heading", { name: "Scholarship Builders" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    expect(
      screen.getByText("I added a checklist for the essay review."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/start call/i)).not.toBeInTheDocument();
  });

  it("sends a text message through the REST contract", async () => {
    const user = userEvent.setup();
    renderGroup();

    const composer = await screen.findByRole("textbox", {
      name: "Message Scholarship Builders",
    });
    await user.type(composer, "Great — I will review it tonight.");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        group.id,
        { body: "Great — I will review it tonight." },
        expect.any(Function),
      );
    });
    expect(
      await screen.findByText("Great — I will review it tonight."),
    ).toBeInTheDocument();
  });
});
