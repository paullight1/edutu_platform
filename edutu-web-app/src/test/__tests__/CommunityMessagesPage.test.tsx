import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  fetchDmConversations: vi.fn(), fetchDmRequests: vi.fn(), fetchDmConversation: vi.fn(),
  fetchDmMessages: vi.fn(), markDmConversationRead: vi.fn(), sendDmMessage: vi.fn(),
  acceptDmRequest: vi.fn(), declineDmRequest: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({ getToken: mocks.getToken, userId: "user_me" }),
}));

vi.mock("../../services/communityDms", async () => {
  const actual = await vi.importActual<typeof import("../../services/communityDms")>("../../services/communityDms");
  return { ...actual, fetchDmConversations: mocks.fetchDmConversations, fetchDmRequests: mocks.fetchDmRequests, fetchDmConversation: mocks.fetchDmConversation, fetchDmMessages: mocks.fetchDmMessages, markDmConversationRead: mocks.markDmConversationRead, sendDmMessage: mocks.sendDmMessage, acceptDmRequest: mocks.acceptDmRequest, declineDmRequest: mocks.declineDmRequest };
});

import CommunityMessagesPage from "../../components/CommunityMessagesPage";

const conversation = {
  id: "conversation-1", status: "accepted" as const, requestedBy: "user_other",
  createdAt: "2026-08-20T12:00:00.000Z", acceptedAt: "2026-08-20T12:05:00.000Z",
  lastMessageAt: "2026-08-22T12:00:00.000Z",
  otherUser: { userId: "user_other", displayName: "Tomi Ade", avatarUrl: null }, blocked: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue("clerk-token");
  mocks.fetchDmConversations.mockResolvedValue([{ ...conversation, lastMessage: { body: "Did you finish the essay draft?", senderId: "user_other", createdAt: "2026-08-22T12:00:00.000Z" }, unreadCount: 1 }]);
  mocks.fetchDmRequests.mockResolvedValue([]);
  mocks.fetchDmConversation.mockResolvedValue(conversation);
  mocks.fetchDmMessages.mockResolvedValue([{ id: "dm-1", conversationId: conversation.id, senderId: "user_other", body: "Did you finish the essay draft?", createdAt: "2026-08-22T12:00:00.000Z", sender: conversation.otherUser }]);
  mocks.markDmConversationRead.mockResolvedValue({ success: true });
  mocks.sendDmMessage.mockResolvedValue({ id: "dm-2", conversationId: conversation.id, senderId: "user_me", body: "Yes — sending it tonight.", createdAt: "2026-08-22T12:02:00.000Z", sender: { userId: "user_me", displayName: "Me", avatarUrl: null } });
});

function renderConversation() {
  return render(<MemoryRouter initialEntries={["/app/community/messages/conversation-1"]}><Routes><Route path="/app/community/messages/:conversationId" element={<CommunityMessagesPage />} /></Routes></MemoryRouter>);
}

describe("CommunityMessagesPage", () => {
  it("renders an accepted private conversation with safety controls", async () => {
    renderConversation();
    expect(await screen.findByRole("heading", { name: "Tomi Ade" })).toBeInTheDocument();
    const selectedConversation = await screen.findByRole("region", { name: "Selected conversation" });
    expect(within(selectedConversation).getByText("Did you finish the essay draft?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block Tomi Ade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call/i })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.markDmConversationRead).toHaveBeenCalled());
  });

  it("sends a private message through the accepted conversation contract", async () => {
    renderConversation();
    const composer = await screen.findByRole("textbox", { name: "Message Tomi Ade" });
    fireEvent.change(composer, { target: { value: "Yes — sending it tonight." } });
    fireEvent.click(screen.getByRole("button", { name: "Send private message" }));
    await waitFor(() => expect(mocks.sendDmMessage).toHaveBeenCalledWith(conversation.id, "Yes — sending it tonight.", mocks.getToken));
    expect(await screen.findByText("Yes — sending it tonight.")).toBeInTheDocument();
  });
});
