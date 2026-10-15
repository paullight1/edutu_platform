import { act, fireEvent, render, screen } from "@testing-library/react";
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
    vi.restoreAllMocks();
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

  it("publishes its rendered height and clears it after dismissal", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 96,
      left: 0,
      width: 1200,
      height: 96,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <MemoryRouter>
        <CookieConsent />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(document.documentElement.style.getPropertyValue("--cookie-consent-height")).toBe("96px");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(document.documentElement.style.getPropertyValue("--cookie-consent-height")).toBe("0px");
  });
});
