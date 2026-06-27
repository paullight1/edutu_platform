import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(
      screen.getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/auth?mode=sign-in");
    expect(screen.getByText("Editorial content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("max-w-3xl", "py-8");
  });
});

describe("AppWorkspaceShell", () => {
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
    expect(
      screen.getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Primary workspace pages" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /open more workspace pages/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(workspaceMocks.signOut).toHaveBeenCalledTimes(1);
  });
});
