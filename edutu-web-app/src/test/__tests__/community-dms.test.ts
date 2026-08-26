import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommunityDmApiError,
  DM_MESSAGE_MAX_LENGTH,
  createDmRequest,
  sendDmMessage,
} from "../../services/communityDms";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("community DM transport", () => {
  it("creates a message request with Clerk authorization", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          conversation: {
            id: "conversation-1",
            status: "pending",
            requestedBy: "user_me",
          },
          message: {
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "user_me",
            body: "Hi — want to compare applications?",
            createdAt: "2026-08-22T12:00:00.000Z",
            sender: {
              userId: "user_me",
              displayName: "Me",
              avatarUrl: null,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createDmRequest(
      "user_other",
      "Hi — want to compare applications?",
      async () => "clerk-token",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/community-dms/requests");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer clerk-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      recipientId: "user_other",
      body: "Hi — want to compare applications?",
    });
  });

  it("rejects an over-limit message before touching the network", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      sendDmMessage(
        "conversation-1",
        "x".repeat(DM_MESSAGE_MAX_LENGTH + 1),
        async () => "clerk-token",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CommunityDmApiError>>({
        name: "CommunityDmApiError",
        status: 400,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
