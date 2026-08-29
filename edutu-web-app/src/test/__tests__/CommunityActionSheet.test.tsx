import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommunityActionSheet from "../../features/community/components/CommunityActionSheet";

describe("CommunityActionSheet", () => {
  it("presents a concise destructive action without using a native dialog", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <CommunityActionSheet
        open
        title="Leave community"
        description="You may need a new invitation to return."
        confirmLabel="Leave"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Leave community" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render when closed", () => {
    render(
      <CommunityActionSheet
        open={false}
        title="Remove conversation"
        description="This removes it from your inbox."
        confirmLabel="Remove"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
