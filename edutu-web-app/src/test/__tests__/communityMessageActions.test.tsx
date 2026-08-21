import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
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
  author: { displayName: "Amina", avatarUrl: null },
};

function renderOtherMemberMessage() {
  const onReport = vi.fn();
  const onBlock = vi.fn();
  const props = {
    message: otherMemberMessage,
    mine: false,
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

describe("community message safety actions", () => {
  it("lets a reader report a visible message without deleting it", () => {
    const { onReport } = renderOtherMemberMessage();

    screen.getByRole("button", { name: /report message/i }).click();

    expect(onReport).toHaveBeenCalledWith(otherMemberMessage);
    expect(screen.getByText("Here is the essay structure I used.")).toBeInTheDocument();
  });

  it("lets a reader block the author of someone else's message", () => {
    const { onBlock } = renderOtherMemberMessage();

    screen.getByRole("button", { name: /block Amina/i }).click();

    expect(onBlock).toHaveBeenCalledWith(otherMemberMessage);
  });
});
