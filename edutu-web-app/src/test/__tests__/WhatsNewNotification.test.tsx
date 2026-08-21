import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import WhatsNewNotification from "../../components/WhatsNewNotification";

function renderNotification() {
  return render(
    <MemoryRouter>
      <WhatsNewNotification />
    </MemoryRouter>,
  );
}

describe("WhatsNewNotification", () => {
  it("dismisses for the current page lifetime and returns after a remount", () => {
    const view = renderNotification();

    expect(
      screen.getByRole("status", { name: "Edutu product update" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Edutu just got better")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss product update" }),
    );

    expect(
      screen.queryByRole("status", { name: "Edutu product update" }),
    ).not.toBeInTheDocument();

    view.unmount();
    renderNotification();

    expect(
      screen.getByRole("status", { name: "Edutu product update" }),
    ).toBeInTheDocument();
  });
});
