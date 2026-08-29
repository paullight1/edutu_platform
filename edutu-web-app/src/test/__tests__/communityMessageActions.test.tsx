import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MessageBubble from "../../features/community/components/MessageBubble";
import type { CommunityMessage } from "../../features/community/types";

const otherMemberMessage: CommunityMessage = {
  id: "11111111-1111-4111-8111-111111111111",
  groupId: "22222222-2222-4222-8222-222222222222",
  userId: "user_other",
  body: "Here is the essay structure I used.",
  kind: "text",
  opportunityId: null,
  createdAt: "2026-08-21T05:00:00.000Z",
  deletedAt: null,
  deletedBy: null,
  likeCount: 7,
  commentCount: 3,
  viewerHasLiked: false,
  parentMessageId: null,
  pinnedAt: null,
  pinnedBy: null,
  author: { displayName: "Amina", avatarUrl: null },
};

function renderMessage(mine = false) {
  const onReport = vi.fn();
  const onBlock = vi.fn();
  const props = {
    message: otherMemberMessage,
    mine,
    canDelete: false,
    onReport,
    onBlock,
  } as unknown as ComponentProps<typeof MessageBubble>;

  render(
    <MemoryRouter>
      <MessageBubble {...props} />
    </MemoryRouter>,
  );
  return { onReport, onBlock };
}

function renderOtherMemberMessage() {
  return renderMessage(false);
}

describe("community message safety actions", () => {
  it("lets a reader report a visible message without deleting it", () => {
    const { onReport } = renderOtherMemberMessage();

    expect(
      screen.queryByRole("button", { name: /report message/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /post actions for Amina/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /report message/i }));

    expect(onReport).toHaveBeenCalledWith(otherMemberMessage);
    expect(
      screen.queryByRole("button", { name: /report message/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Here is the essay structure I used."),
    ).toBeInTheDocument();
  });

  it("lets a reader block the author of someone else's message", () => {
    const { onBlock } = renderOtherMemberMessage();

    fireEvent.click(
      screen.getByRole("button", { name: /post actions for Amina/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /block Amina/i }));

    expect(onBlock).toHaveBeenCalledWith(otherMemberMessage);
  });

  it("keeps every community post in one readable feed order in RTL", () => {
    const incoming = render(
      <MemoryRouter>
        <MessageBubble
          message={otherMemberMessage}
          mine={false}
          canDelete={false}
        />
      </MemoryRouter>,
    );
    const incomingPost = screen
      .getByText(otherMemberMessage.body)
      .closest("article");
    const incomingBody = screen.getByText(
      otherMemberMessage.body,
    ).parentElement;

    expect(incomingBody).toHaveClass("text-start");
    expect(incomingPost).not.toHaveClass("flex-row-reverse");

    incoming.unmount();
    renderMessage(true);
    const outgoingPost = screen
      .getByText(otherMemberMessage.body)
      .closest("article");
    const outgoingBody = screen.getByText(
      otherMemberMessage.body,
    ).parentElement;

    expect(outgoingBody).toHaveClass("text-start");
    expect(outgoingPost).not.toHaveClass("flex-row-reverse");
  });
});

describe("community post engagement actions", () => {
  it("shows persisted counts and opens the Facebook-style post detail", () => {
    renderOtherMemberMessage();

    expect(
      screen.getByRole("link", {
        name: otherMemberMessage.body,
      }),
    ).toHaveAttribute(
      "href",
      `/app/community/groups/${otherMemberMessage.groupId}/posts/${otherMemberMessage.id}`,
    );
    expect(screen.getByRole("button", { name: "Like post" })).toHaveTextContent(
      "7",
    );
    expect(screen.getByRole("link", { name: /3 comments/i })).toHaveAttribute(
      "href",
      `/app/community/groups/${otherMemberMessage.groupId}/posts/${otherMemberMessage.id}`,
    );
    expect(screen.getByRole("button", { name: "Share post" })).toBeVisible();
  });

  it("asks the parent to optimistically toggle a like", () => {
    const onToggleLike = vi.fn();
    render(
      <MemoryRouter>
        <MessageBubble
          message={otherMemberMessage}
          mine={false}
          canDelete={false}
          onToggleLike={onToggleLike}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Like post" }));

    expect(onToggleLike).toHaveBeenCalledWith(otherMemberMessage);
  });

  it("copies the absolute post link when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderOtherMemberMessage();

    fireEvent.click(screen.getByRole("button", { name: "Share post" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/app/community/groups/${otherMemberMessage.groupId}/posts/${otherMemberMessage.id}`,
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  it("lets a moderator pin a top-level post from its menu", () => {
    const onPin = vi.fn();
    render(
      <MemoryRouter>
        <MessageBubble
          message={otherMemberMessage}
          mine={false}
          canDelete={false}
          canPin
          onPin={onPin}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /post actions for Amina/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pin post" }));

    expect(onPin).toHaveBeenCalledWith(otherMemberMessage, true);
  });
});
