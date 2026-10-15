import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommunityChatsPage from "../../features/community/CommunityChatsPage";
import { CommunityDmApi, type DmConversationSummary } from "../../features/community/dmApi";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("token") }),
}));

const conversations: DmConversationSummary[] = [
  {
    id: "conversation-amina",
    status: "accepted",
    requestedBy: "user-amina",
    createdAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T10:05:00.000Z",
    lastMessageAt: "2026-08-27T09:00:00.000Z",
    otherUser: {
      userId: "user-amina",
      displayName: "Amina Yusuf",
      avatarUrl: "https://images.example.com/amina.jpg",
    },
    blocked: false,
    lastMessage: {
      body: "I reviewed your scholarship essay",
      senderId: "user-amina",
      createdAt: "2026-08-27T09:00:00.000Z",
    },
    unreadCount: 2,
  },
  {
    id: "conversation-david",
    status: "accepted",
    requestedBy: "user-david",
    createdAt: "2026-07-01T10:00:00.000Z",
    acceptedAt: "2026-07-01T10:05:00.000Z",
    lastMessageAt: "2026-08-20T09:00:00.000Z",
    otherUser: {
      userId: "user-david",
      displayName: "David Okafor",
      avatarUrl: null,
    },
    blocked: false,
    lastMessage: {
      body: "Thanks for sharing that resource",
      senderId: "user-david",
      createdAt: "2026-08-20T09:00:00.000Z",
    },
    unreadCount: 0,
  },
];

describe("CommunityChatsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CommunityDmApi.prototype, "listConversations").mockResolvedValue(
      conversations,
    );
  });

  it("filters the inbox by member name or message preview", async () => {
    render(
      <MemoryRouter>
        <CommunityChatsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Amina Yusuf");
    const search = screen.getByRole("searchbox", { name: "Search chats" });
    fireEvent.change(search, { target: { value: "essay" } });

    expect(screen.getByText("Amina Yusuf")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("David Okafor")).not.toBeInTheDocument();
    });
  });
  it("lets mobile users filter unread chats and return to the full inbox", async () => {
    render(<MemoryRouter initialEntries={["/app/community/chats"]}><CommunityChatsPage /></MemoryRouter>);
    await screen.findByText("Amina Yusuf");

    fireEvent.click(screen.getByRole("button", { name: /Unread 1/i }));
    expect(screen.getByText("Amina Yusuf")).toBeVisible();
    expect(screen.queryByText("David Okafor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unread 1/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /All 2/i }));
    expect(screen.getByText("David Okafor")).toBeVisible();
  });

  it("makes the remove action accessible without desktop hover", async () => {
    render(<MemoryRouter initialEntries={["/app/community/chats"]}><CommunityChatsPage /></MemoryRouter>);
    await screen.findByText("Amina Yusuf");
    expect(screen.getByRole("button", { name: "Remove conversation with Amina Yusuf" }))
      .toHaveClass("opacity-100", "sm:opacity-0");
  });

  it("clears search filters without navigating away from conversations", async () => {
    render(<MemoryRouter initialEntries={["/app/community/chats"]}><CommunityChatsPage /></MemoryRouter>);
    await screen.findByText("Amina Yusuf");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search chats" }), { target: { value: "not a real chat" } });
    expect(screen.getByText("No conversations found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(screen.getByText("David Okafor")).toBeVisible();
  });

});
