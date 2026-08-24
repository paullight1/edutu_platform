import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness({ onConfirm = vi.fn(), onCancel = vi.fn() }) {
  return (
    <>
      <button type="button">Opening control</button>
      <ConfirmDialog
        isOpen
        title="Delete source?"
        message="This cannot be undone."
        confirmLabel="Delete source"
        cancelLabel="Keep source"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  beforeEach(() => {
    document.body.style.overflow = "auto";
  });

  it("focuses the safe action first and exposes an accessible close control", async () => {
    render(<Harness />);

    const dialog = screen.getByRole("alertdialog", { name: "Delete source?" });
    expect(dialog).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep source" })).toHaveFocus(),
    );
    expect(
      screen.getByRole("button", { name: "Close confirmation dialog" }),
    ).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape, restores the opener, and restores body scrolling", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);

    const opener = screen.getByRole("button", { name: "Opening control" });
    opener.focus();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep source" })).toHaveFocus(),
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps keyboard focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const cancel = screen.getByRole("button", { name: "Keep source" });
    const confirm = screen.getByRole("button", { name: "Delete source" });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close confirmation dialog" })).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });
});
