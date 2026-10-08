import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppWorkspaceShell from "../../components/AppWorkspaceShell";
import PublicEditorialShell from "../../components/PublicEditorialShell";
import { useWorkspaceNotice } from "../../components/workspaceNoticeContext";
import "../../i18n";

const clerkMocks = vi.hoisted(() => ({
  isSignedIn: false,
  user: null as null | {
    fullName?: string;
    username?: string;
    primaryEmailAddress?: { emailAddress?: string };
    imageUrl?: string;
  },
}));

const workspaceMocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  user: {
    name: "Nia Okafor",
    email: "nia@example.com",
  },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: clerkMocks.isSignedIn }),
  useUser: () => ({ user: clerkMocks.user }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: workspaceMocks.user,
    signOut: workspaceMocks.signOut,
  }),
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: () => ({ isDarkMode: false }),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({
    isPro: false,
    billing: null,
    billingLoading: false,
    openPaywall: vi.fn(),
    closePaywall: vi.fn(),
    refreshBilling: vi.fn(),
    handleUpgradeError: vi.fn().mockReturnValue(false),
  }),
}));

beforeEach(() => {
  clerkMocks.isSignedIn = false;
  clerkMocks.user = null;
  workspaceMocks.signOut.mockClear();
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440,
  });
});

describe("PublicEditorialShell", () => {
  it("renders the public header and custom main class", () => {
    render(
      <MemoryRouter>
        <PublicEditorialShell mainClassName="max-w-3xl py-8">
          <div>Editorial content</div>
        </PublicEditorialShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Edutu home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth?mode=sign-in",
    );
    expect(screen.getByText("Editorial content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-3xl", "py-8");
  });
});

describe("AppWorkspaceShell", () => {
  function BlockingNoticeHarness({ open }: { open: boolean }) {
    const { setBlockingNotice } = useWorkspaceNotice();

    useEffect(() => {
      setBlockingNotice({ pending: false, open });
    }, [open, setBlockingNotice]);

    return null;
  }

  it("keeps the community announcement hidden while Communities is paused", async () => {
    vi.useFakeTimers();
    const view = render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <AppWorkspaceShell>
          <BlockingNoticeHarness open />
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(
      screen.queryByRole("dialog", { name: "Meet Edutu Communities" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("dialog", { name: "Meet Edutu Communities" }),
    ).not.toBeInTheDocument();
    view.unmount();
    vi.useRealTimers();
  });

  it("does not introduce the paused Communities announcement", async () => {
    vi.useFakeTimers();

    const firstRender = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppWorkspaceShell>
          <div>Dashboard content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      screen.queryByRole("dialog", { name: "Meet Edutu Communities" }),
    ).not.toBeInTheDocument();
    firstRender.unmount();
    vi.useRealTimers();
  });

  it("shows the compact mobile page title without a brand image", () => {
    render(
      <MemoryRouter initialEntries={["/app/opportunities"]}>
        <AppWorkspaceShell>
          <div>Opportunity results</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    const mobileHeader = screen.getByRole("banner");
    expect(within(mobileHeader).getByText("Opportunities")).toBeInTheDocument();
    expect(
      within(mobileHeader).queryByRole("img", { name: "Edutu" }),
    ).not.toBeInTheDocument();
  });

  it("keeps notifications above the account menu and exposes profile actions there", () => {
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <AppWorkspaceShell>
          <div>Workspace content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("Nia Okafor")).toBeInTheDocument();
    expect(screen.getByText("nia@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edutu dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary workspace pages" }),
    ).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", {
      name: "Workspace navigation",
    });
    const notifications = within(sidebar).getByRole("link", {
      name: "Notifications",
    });
    const accountButton = within(sidebar).getByRole("button", {
      name: "Account options for Nia Okafor",
    });
    expect(
      notifications.compareDocumentPosition(accountButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(accountButton);
    const accountMenu = screen.getByRole("menu", { name: "Account options" });
    expect(
      within(accountMenu).getByRole("menuitem", { name: "Profile" }),
    ).toHaveAttribute("href", "/app/profile");
    expect(
      within(accountMenu).getByRole("menuitem", { name: "Settings" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(
      within(accountMenu).getByRole("menuitem", { name: "Log out" }),
    );
    expect(workspaceMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps compact mobile navigation labels without a coach shortcut in More", () => {
    const primary = render(
      <MemoryRouter initialEntries={["/app/coach"]}>
        <AppWorkspaceShell>
          <div>Coach content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", {
      name: "Mobile app navigation",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.some((link) => link.textContent?.trim() === "Home")).toBe(
      true,
    );
    expect(links.some((link) => link.textContent?.trim() === "Explore")).toBe(true);
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    const more = screen.getByRole("dialog", { name: "More" });
    expect(within(more).queryByRole("link", { name: "AI Coach" })).not.toBeInTheDocument();
    expect(within(more).getByRole("link", { name: "CV & AI tools" })).toHaveAttribute("href", "/app/cv");
    primary.unmount();

    render(
      <MemoryRouter initialEntries={["/app/cv"]}>
        <AppWorkspaceShell>
          <div>CV content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("navigation", { name: "Mobile app navigation" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByText("CV & AI tools"),
    ).toBeInTheDocument();
  });

  it("opens the More sheet and returns keyboard focus when dismissed", () => {
    render(
      <MemoryRouter initialEntries={["/app/goals"]}>
        <AppWorkspaceShell>
          <div>Goals content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "More" });
    expect(
      within(dialog).getByRole("button", { name: "Close menu" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the More menu focused on destinations outside the primary tabs", () => {
    render(
      <MemoryRouter initialEntries={["/app/my-plan"]}>
        <AppWorkspaceShell>
          <div>My Plan content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More" }),
    );
    const menu = screen.getByRole("dialog", { name: "More" });
    expect(
      within(menu).getByRole("link", { name: "Deadlines" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("link", { name: "Saved" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("link", { name: "Applications" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "Home" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "Opportunities" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "Community" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: "My Plan" }),
    ).not.toBeInTheDocument();
  });

  it("removes the universal mobile chrome inside the community workspace", () => {
    render(
      <MemoryRouter initialEntries={["/app/community/explore"]}>
        <AppWorkspaceShell>
          <div>Community workspace</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("navigation", { name: "Mobile app navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
