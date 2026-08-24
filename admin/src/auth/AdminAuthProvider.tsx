import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminRoutePath } from "../app/route-manifest";
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

export interface AdminAuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export interface AdminAuthContextValue extends AdminAuthState {
  signOut(): Promise<void>;
}

const INITIAL_AUTH_STATE: AdminAuthState = {
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
  error: null,
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function isPasswordRecoveryLocation(): boolean {
  return (
    window.location.pathname === RESET_PASSWORD_PATH ||
    window.location.hash.includes("type=recovery")
  );
}

function createLocalAdminSession(): Session {
  const email = getLocalAdminEmail();
  const user = {
    id: getLocalAdminUserId(),
    email,
    user_metadata: { full_name: "Local administrator" },
  } as User;

  return {
    access_token: "local-dev-token",
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    refresh_token: "local-dev-refresh-token",
    user,
  };
}

async function checkAdminRole(user: User): Promise<boolean> {
  if (isConfiguredAdminEmail(user.email)) return true;

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return false;
    return isAdminRole(profile?.role);
  } catch {
    return false;
  }
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

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AdminAuthState>(INITIAL_AUTH_STATE);
  const requestVersion = useRef(0);

  const applySession = useCallback(
    async (
      session: Session | null,
      event?: AuthChangeEvent,
    ): Promise<void> => {
      const version = ++requestVersion.current;

      if (
        event === "PASSWORD_RECOVERY" ||
        isPasswordRecoveryLocation()
      ) {
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

      setAuth((current) => ({
        ...current,
        session,
        user: session.user,
        loading: true,
        error: null,
      }));

      const admin = await checkAdminRole(session.user);
      if (version !== requestVersion.current) return;

      setAuth({
        session,
        user: session.user,
        isAdmin: admin,
        loading: false,
        error: null,
      });
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (isLocalAdminBypassEnabled()) {
      const session = createLocalAdminSession();
      setAuth({
        session,
        user: session.user,
        isAdmin: true,
        loading: false,
        error: null,
      });
      return () => {
        requestVersion.current += 1;
      };
    }

    if (isPasswordRecoveryLocation()) {
      setAuth(signedOutState());
      return () => {
        requestVersion.current += 1;
      };
    }

    timeoutId = setTimeout(() => {
      if (disposed) return;
      setAuth((current) =>
        current.loading
          ? signedOutState("Authentication check timed out.")
          : current,
      );
    }, AUTH_TIMEOUT_MS);

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (disposed) return;
        if (error) {
          setAuth(signedOutState("Authentication session is unavailable."));
          return;
        }
        return applySession(data.session);
      })
      .catch(() => {
        if (!disposed) {
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
      void applySession(session, event);
    });

    return () => {
      disposed = true;
      requestVersion.current += 1;
      if (timeoutId !== null) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    await signOutAdmin();
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ ...auth, signOut }),
    [auth, signOut],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  }
  return context;
}
