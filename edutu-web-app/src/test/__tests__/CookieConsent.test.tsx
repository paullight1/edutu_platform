import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "../../components/CookieConsent";

describe("CookieConsent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills the bottom edge with only Reject and Accept actions", () => {
    render(
      <MemoryRouter>
        <CookieConsent />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(700);
    });

    const notice = screen.getByRole("dialog", { name: "Cookie consent" });

    expect(notice).toHaveClass("inset-x-0", "bottom-0", "w-full");
    expect(notice).not.toHaveClass("max-w-xl", "rounded-2xl");
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Reject", "Accept"]);
  });
});
