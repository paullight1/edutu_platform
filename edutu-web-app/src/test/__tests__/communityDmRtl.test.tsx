import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  markRead: vi.fn(async () => ({ success: true as const })),
  sendMessage: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: mocks.getToken, userId: "user_me" }),
}));

vi.mock("../../features/community/dmApi", () => ({
  DM_MESSAGE_MAX_LENGTH: 2000,
  CommunityDmApi: class {
    getConversation = mocks.getConversation;
    listMessages = mocks.listMessages;
    markRead = mocks.markRead;
    sendMessage = mocks.sendMessage;
  },
}));

vi.mock("../../features/community/dmRealtime", () => ({
  subscribeToDmMessages: () => () => undefined,
}));

vi.mock("../../components/Seo", () => ({ default: () => null }));
vi.mock(
  "../../features/community/components/CommunityProductShell",
  () => ({
    default: ({ action, children }: { action?: ReactNode; children: ReactNode }) => (
      <div>
        {action}
        {children}
      </div>
    ),
  }),
);

import CommunityDmPage from "../../features/community/CommunityDmPage";

const conversationId = "11111111-1111-4111-8111-111111111111";
const otherUser = {
  userId: "user_other",
  displayName: "Amina",
  avatarUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConversation.mockResolvedValue({
    id: conversationId,
    status: "accepted",
    requestedBy: "user_other",
    createdAt: "2026-08-24T10:00:00.000Z",
    acceptedAt: "2026-08-24T10:05:00.000Z",
    lastMessageAt: "2026-08-24T10:10:00.000Z",
    otherUser,
    blocked: false,
  });
  mocks.listMessages.mockResolvedValue([
    {
      id: "22222222-2222-4222-8222-222222222222",
      conversationId,
      senderId: "user_other",
      body: "Incoming message",
      createdAt: "2026-08-24T10:09:00.000Z",
      sender: otherUser,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      conversationId,
      senderId: "user_me",
      body: "Outgoing message",
      createdAt: "2026-08-24T10:10:00.000Z",
      sender: { userId: "user_me", displayName: "You", avatarUrl: null },
    },
  ]);
});

function renderDm() {
  return render(
    <MemoryRouter initialEntries={[`/app/community/dm/${conversationId}`]}>
      <Routes>
        <Route path="/app/community/dm/:id" element={<CommunityDmPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Community DM RTL layout", () => {
  it("uses logical message alignment and logical corners", async () => {
    renderDm();

    const incoming = await screen.findByText("Incoming message");
    const outgoing = screen.getByText("Outgoing message");

    expect(incoming).toHaveClass("text-start", "rounded-ss-md");
    expect(incoming).not.toHaveClass("text-left", "rounded-tl-md");
    expect(outgoing).toHaveClass("text-start", "rounded-se-md");
    expect(outgoing).not.toHaveClass("text-left", "rounded-tr-md");

    const counter = screen.getByText("0/2000");
    expect(counter).toHaveClass("text-end");
    expect(counter).not.toHaveClass("text-right");

    expect(
      screen.queryByRole("link", { name: "Back to chats" }),
    ).not.toBeInTheDocument();
  });
});
