import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthProvider } from "./AdminAuthProvider";
import { useAdminAuth } from "./admin-auth-context";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  from: vi.fn(),
  signOutAdmin: vi.fn(),
  isConfiguredAdminEmail: vi.fn(),
  isAdminRole: vi.fn(),
  isLocalAdminBypassEnabled: vi.fn(),
  getLocalAdminEmail: vi.fn(),
  getLocalAdminUserId: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: mocks.from,
  },
}));

vi.mock("../lib/auth", () => ({
  signOutAdmin: mocks.signOutAdmin,
}));

vi.mock("../lib/adminAccess", () => ({
  isConfiguredAdminEmail: mocks.isConfiguredAdminEmail,
  isAdminRole: mocks.isAdminRole,
}));

vi.mock("../lib/localAdmin", () => ({
  isLocalAdminBypassEnabled: mocks.isLocalAdminBypassEnabled,
  getLocalAdminEmail: mocks.getLocalAdminEmail,
  getLocalAdminUserId: mocks.getLocalAdminUserId,
}));

function createSession(email = "paul@edutu.org"): Session {
  const user: User = {
    id: "user-1",
    email,
    aud: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Paul Light" },
    identities: [],
    created_at: new Date(0).toISOString(),
  };

  return {
    access_token: "token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh",
    user,
  };
}

function Consumer() {
  const auth = useAdminAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="email">{auth.user?.email || "anonymous"}</span>
      <span data-testid="admin">{String(auth.isAdmin)}</span>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out through provider
      </button>
    </div>
  );
}

function renderProvider(children: ReactNode = <Consumer />) {
  return render(<AdminAuthProvider>{children}</AdminAuthProvider>);
}

describe("AdminAuthProvider", () => {
  let authCallback:
    | ((event: AuthChangeEvent, session: Session | null) => void)
    | null;

  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    mocks.isLocalAdminBypassEnabled.mockReturnValue(false);
    mocks.getLocalAdminEmail.mockReturnValue("local-admin@edutu.test");
    mocks.getLocalAdminUserId.mockReturnValue("local-admin");
    mocks.isConfiguredAdminEmail.mockReturnValue(true);
    mocks.isAdminRole.mockReturnValue(false);
    mocks.getSession.mockResolvedValue({
      data: { session: createSession() },
      error: null,
    });
    mocks.onAuthStateChange.mockImplementation(
      (
        callback: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        authCallback = callback;
        return {
          data: { subscription: { unsubscribe: mocks.unsubscribe } },
        };
      },
    );
    mocks.signOutAdmin.mockResolvedValue(undefined);
  });

  it("owns one session lookup and one auth subscription for the admin application", async () => {
    const view = renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("paul@edutu.org");
    expect(screen.getByTestId("admin")).toHaveTextContent("true");
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("publishes subsequent auth changes without creating another subscription", async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("paul@edutu.org"),
    );

    await act(async () => {
      authCallback?.("SIGNED_OUT", null);
    });

    expect(screen.getByTestId("email")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("delegates sign-out through the shared auth boundary", async () => {
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    await user.click(
      screen.getByRole("button", { name: "Sign out through provider" }),
    );

    expect(mocks.signOutAdmin).toHaveBeenCalledTimes(1);
  });
});
