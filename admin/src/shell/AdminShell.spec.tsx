import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminShell from "./AdminShell";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  signOutAdmin: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

vi.mock("../lib/auth", () => ({
  signOutAdmin: mocks.signOutAdmin,
}));

vi.mock("../components/BackendHealthChip", () => ({
  default: () => <div data-testid="backend-health">Backend healthy</div>,
}));

function renderShell(path = "/engine/runs") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AdminShell />}>
          <Route path="engine" element={<div>Sources content</div>} />
          <Route path="engine/runs" element={<div>Runs content</div>} />
          <Route path="engine/status" element={<div>Status content</div>} />
          <Route path="settings" element={<div>Settings content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminShell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "paul@edutu.org",
          user_metadata: { full_name: "Paul Light" },
        },
      },
    });
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    });
    mocks.signOutAdmin.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute("data-theme");
  });

  it("shows the active Engine section and destination from the route manifest", () => {
    renderShell();

    const primary = screen.getByRole("navigation", {
      name: "Primary admin navigation",
    });
    expect(
      within(primary).getByRole("button", { name: "Engine section" }),
    ).toHaveAttribute("aria-expanded", "true");

    const section = screen.getByRole("navigation", {
      name: "Engine navigation",
    });
    expect(within(section).getByRole("link", { name: "Sources" })).toHaveAttribute(
      "href",
      "/engine",
    );
    expect(
      within(section).getByRole("link", { name: "Live Runs" }),
    ).toHaveAttribute("aria-current", "page");
    expect(within(section).getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      "/engine/status",
    );
    expect(screen.getByText("Runs content")).toBeInTheDocument();
  });

  it("gives every icon-only primary destination an accessible name", () => {
    renderShell();

    const primary = screen.getByRole("navigation", {
      name: "Primary admin navigation",
    });
    expect(within(primary).getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(
      within(primary).getByRole("button", { name: "Content section" }),
    ).toBeVisible();
    expect(
      within(primary).getByRole("button", { name: "People section" }),
    ).toBeVisible();
    expect(
      within(primary).getByRole("button", {
        name: "App & Engagement section",
      }),
    ).toBeVisible();
    expect(
      within(primary).getByRole("button", { name: "Monetization section" }),
    ).toBeVisible();
    expect(
      within(primary).getByRole("button", { name: "Engine section" }),
    ).toBeVisible();
    expect(within(primary).getByRole("link", { name: "Settings" })).toBeVisible();
  });

  it("keeps the existing theme and sidebar preference keys", async () => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("sidebar", "collapsed");
    const user = userEvent.setup();
    renderShell();

    const shell = screen.getByTestId("admin-shell");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(shell).toHaveAttribute("data-section-open", "false");

    await user.click(
      screen.getByRole("button", { name: "Engine section" }),
    );

    expect(shell).toHaveAttribute("data-section-open", "true");
    expect(localStorage.getItem("sidebar")).toBe("expanded");
  });

  it("opens the mobile drawer, closes it with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", {
      name: "Open admin navigation",
    });

    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Admin navigation" });
    expect(drawer).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(drawer).getByRole("button", { name: "Close admin navigation" }),
      ).toHaveFocus(),
    );

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Admin navigation" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("preserves backend health, profile, theme, and sign-out utilities", async () => {
    const user = userEvent.setup();
    renderShell();

    const primary = screen.getByRole("navigation", {
      name: "Primary admin navigation",
    });
    expect(screen.getByTestId("backend-health")).toBeInTheDocument();
    expect(
      within(primary).getByRole("link", { name: "My Profile" }),
    ).toHaveAttribute("href", "/profile");
    expect(
      within(primary).getByRole("button", { name: "Switch to light mode" }),
    ).toBeVisible();

    await user.click(within(primary).getByRole("button", { name: "Sign Out" }));
    expect(mocks.signOutAdmin).toHaveBeenCalledTimes(1);
  });
});
