import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppWorkspaceShell from "../../components/AppWorkspaceShell";
import PublicEditorialShell from "../../components/PublicEditorialShell";
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

  it("renders the workspace nav and signs out from the current route", () => {
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <AppWorkspaceShell>
          <div>Workspace content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("Nia Okafor")).toBeInTheDocument();
    expect(screen.getByText("nia@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("navigation", { name: "Primary workspace pages" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /open more workspace pages/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(workspaceMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("uses color alone to emphasize active mobile navigation items", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppWorkspaceShell>
          <div>Dashboard content</div>
        </AppWorkspaceShell>
      </MemoryRouter>,
    );

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile app navigation",
    });
    const homeLink = within(mobileNavigation).getByRole("link", {
      name: "Home",
    });
    const moreButton = within(mobileNavigation).getByRole("button", {
      name: "Open more workspace pages",
    });

    expect(homeLink).toHaveClass("text-brand-600");
    expect(
      homeLink.querySelector(":scope > span[aria-hidden='true']"),
    ).not.toBeInTheDocument();

    fireEvent.click(moreButton);
    expect(moreButton).toHaveClass("text-brand-600");
    expect(
      moreButton.querySelector(":scope > span[aria-hidden='true']"),
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
