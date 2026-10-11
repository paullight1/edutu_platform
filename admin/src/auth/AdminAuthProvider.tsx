import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminRoutePath } from "../app/route-manifest";
import {
  AdminAuthContext,
  type AdminAuthContextValue,
  type AdminAuthState,
} from "./admin-auth-context";
import { isAdminRole, isConfiguredAdminEmail } from "../lib/adminAccess";
import { signOutAdmin } from "../lib/auth";
import {
  getLocalAdminEmail,
  getLocalAdminUserId,
  isLocalAdminBypassEnabled,
} from "../lib/localAdmin";
import { supabase } from "../lib/supabase";

const RESET_PASSWORD_PATH = adminRoutePath("reset-password");
const AUTH_TIMEOUT_MS = 10_000;

interface InitialAuthMode {
  state: AdminAuthState;
  skipRemoteAuth: boolean;
}

function isPasswordRecoveryLocation(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname === RESET_PASSWORD_PATH ||
    window.location.hash.includes("type=recovery")
  );
}

function createLocalAdminSession(): Session {
  const email = getLocalAdminEmail();
  const user: User = {
    id: getLocalAdminUserId(),
    email,
    aud: "authenticated",
    app_metadata: { provider: "local", providers: ["local"] },
    user_metadata: { full_name: "Local administrator" },
    identities: [],
    created_at: new Date(0).toISOString(),
  };

  return {
    access_token: "local-dev-token",
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    refresh_token: "local-dev-refresh-token",
    user,
  };
}

function signedOutState(error: string | null = null): AdminAuthState {
  return {
    session: null,
    user: null,
    isAdmin: false,
    loading: false,
    error,
  };
}

function createInitialAuthMode(): InitialAuthMode {
  if (isLocalAdminBypassEnabled()) {
    const session = createLocalAdminSession();
    return {
      state: {
        session,
        user: session.user,
        isAdmin: true,
        loading: false,
        error: null,
      },
      skipRemoteAuth: true,
    };
  }

  if (isPasswordRecoveryLocation()) {
    return { state: signedOutState(), skipRemoteAuth: true };
  }

  return {
    state: {
      session: null,
      user: null,
      isAdmin: false,
      loading: true,
      error: null,
    },
    skipRemoteAuth: false,
  };
}

interface AdminRoleCheckResult {
  isAdmin: boolean;
  error: string | null;
}

async function checkAdminRole(user: User): Promise<AdminRoleCheckResult> {
  if (isConfiguredAdminEmail(user.email)) {
    return { isAdmin: true, error: null };
  }

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return {
        isAdmin: false,
        error: "Admin access could not be verified. Check your connection and try again.",
      };
    }
    return { isAdmin: isAdminRole(profile?.role), error: null };
  } catch {
    return {
      isAdmin: false,
      error: "Admin access could not be verified. Check your connection and try again.",
    };
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [initialMode] = useState(createInitialAuthMode);
  const [auth, setAuth] = useState<AdminAuthState>(initialMode.state);
  const requestVersion = useRef(0);

  const applySession = useCallback(
    async (
      session: Session | null,
      event?: AuthChangeEvent,
    ): Promise<void> => {
      const version = ++requestVersion.current;

      if (event === "PASSWORD_RECOVERY" || isPasswordRecoveryLocation()) {
        setAuth({
          session,
          user: session?.user ?? null,
          isAdmin: false,
          loading: false,
          error: null,
        });
        return;
      }

      if (!session?.user) {
        setAuth(signedOutState());
        return;
      }

      setAuth((current) => {
        const sameUser = current.user?.id === session.user.id;
        return {
          ...current,
          session,
          user: session.user,
          // Refreshing an access token is not a new sign-in. Keep the current
          // admin UI mounted while revalidating the same user's role.
          loading: sameUser ? current.loading : true,
          error: null,
        };
      });

      let roleCheckTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const result = await Promise.race([
          checkAdminRole(session.user),
          new Promise<AdminRoleCheckResult>((resolve) => {
            roleCheckTimeout = setTimeout(
              () =>
                resolve({
                  isAdmin: false,
                  error:
                    "Admin access verification timed out. Check your connection and retry.",
                }),
              AUTH_TIMEOUT_MS,
            );
          }),
        ]);
        if (version !== requestVersion.current) return;

        setAuth({
          session,
          user: session.user,
          isAdmin: result.isAdmin,
          loading: false,
          error: result.error,
        });
      } finally {
        if (roleCheckTimeout !== null) clearTimeout(roleCheckTimeout);
      }
    },
    [],
  );

  useEffect(() => {
    if (initialMode.skipRemoteAuth) {
      return () => {
        requestVersion.current += 1;
      };
    }

    let disposed = false;
    let authStateChanged = false;
    let initialAuthCheckTimedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (disposed) return;
      initialAuthCheckTimedOut = true;
      setAuth((current) =>
        current.loading
          ? signedOutState("Authentication check timed out.")
          : current,
      );
    }, AUTH_TIMEOUT_MS);

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (disposed || authStateChanged || initialAuthCheckTimedOut) return;
        if (error) {
          setAuth(signedOutState("Authentication session is unavailable."));
          return;
        }
        return applySession(data.session);
      })
      .catch(() => {
        if (!disposed && !authStateChanged && !initialAuthCheckTimedOut) {
          setAuth(signedOutState("Authentication initialization failed."));
        }
      })
      .finally(() => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      authStateChanged = true;
      void applySession(session, event);
    });

    return () => {
      disposed = true;
      requestVersion.current += 1;
      if (timeoutId !== null) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [applySession, initialMode.skipRemoteAuth]);

  const signOut = useCallback(async () => {
    await signOutAdmin();
  }, []);

  const retryVerification = useCallback(async () => {
    if (!auth.session) return;
    setAuth((current) => ({ ...current, loading: true, error: null }));
    await applySession(auth.session);
  }, [applySession, auth.session]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ ...auth, retryVerification, signOut }),
    [auth, retryVerification, signOut],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}
