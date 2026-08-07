import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EndCallDialog } from "../components/EndCallDialog";

function DialogHarness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open end dialog</button>
      {open ? (
        <EndCallDialog
          busy={busy}
          error={null}
          onCancel={() => setOpen(false)}
          onConfirm={vi.fn()}
        />
      ) : null}
    </>
  );
}

describe("end call confirmation dialog", () => {
  it("moves focus in, traps Tab, closes on Escape, and restores trigger focus", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open end dialog" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "Keep call open" });
    const confirm = screen.getByRole("button", { name: "End for everyone" });
    expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-modal", "true");
    expect(cancel).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces busy state and cannot be dismissed during the destructive request", () => {
    render(<DialogHarness busy />);
    fireEvent.click(screen.getByRole("button", { name: "Open end dialog" }));
    const dialog = screen.getByRole("alertdialog");

    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Keep call open" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ending call" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
  });
});
