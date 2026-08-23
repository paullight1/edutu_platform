import type { FC } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AlertTriangle } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AdminRoutes from "./app/AdminRoutes";
import { adminRoutePath } from "./app/route-manifest";
import { isAdminRole, isConfiguredAdminEmail } from "./lib/adminAccess";
import { signOutAdmin } from "./lib/auth";
import {
  getLocalAdminEmail,
  getLocalAdminUserId,
  isLocalAdminBypassEnabled,
} from "./lib/localAdmin";
import { supabase } from "./lib/supabase";

const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const LOGIN_PATH = adminRoutePath("login");
const SIGNUP_PATH = adminRoutePath("signup");
const RESET_PASSWORD_PATH = adminRoutePath("reset-password");

interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

const useAuth = () => {
  const [auth, setAuth] = useState<AuthState>({
    session: null,
    user: null,
    isAdmin: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        console.log("[Auth] Initializing auth...");

        if (isLocalAdminBypassEnabled()) {
          const email = getLocalAdminEmail();
          const userId = getLocalAdminUserId();
          const localSession = {
            access_token: "local-dev-token",
            user: {
              id: userId,
              email,
            },
          } as Session;

          if (mounted) {
            setAuth({
              session: localSession,
              user: localSession.user as User,
              isAdmin: true,
              loading: false,
              error: null,
            });
          }
          return;
        }

        if (
          window.location.pathname === RESET_PASSWORD_PATH ||
          window.location.hash.includes("type=recovery")
        ) {
          if (mounted) {
            setAuth({
              session: null,
              user: null,
              isAdmin: false,
              loading: false,
              error: null,
            });
          }
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("[Auth] getSession error:", sessionError);
        }

        if (!session?.user) {
          console.log("[Auth] No active session found");
          if (mounted) {
            setAuth({
              session: null,
              user: null,
              isAdmin: false,
              loading: false,
              error: null,
            });
          }
          return;
        }

        console.log("[Auth] Session active for:", session.user.email);
        const isAdmin = await checkAdminRole(session.user);

        if (mounted) {
          setAuth({
            session,
            user: session.user,
            isAdmin,
            loading: false,
            error: null,
          });
        }
      } catch (error: unknown) {
        console.error("[Auth] Initialization error:", error);
        if (mounted) {
          setAuth((previous) => ({
            ...previous,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Auth initialization failed",
          }));
        }
      }
    }

    const timeoutId = setTimeout(() => {
      if (mounted) {
        setAuth((previous) => {
          if (!previous.loading) return previous;
          console.warn("[Auth] Auth state check timed out globally");
          return { ...previous, loading: false, error: "Auth Timeout" };
        });
      }
    }, 10_000);

    initAuth().finally(() => clearTimeout(timeoutId));

    if (isLocalAdminBypassEnabled()) {
      return () => {
        mounted = false;
        clearTimeout(timeoutId);
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] State changed:", event);
      if (
        window.location.pathname === RESET_PASSWORD_PATH ||
        event === "PASSWORD_RECOVERY"
      ) {
        setAuth({
          session: session ?? null,
          user: session?.user ?? null,
          isAdmin: false,
          loading: false,
          error: null,
        });
        return;
      }

      if (!mounted) return;

      if (!session?.user) {
        setAuth({
          session: null,
          user: null,
          isAdmin: false,
          loading: false,
          error: null,
        });
        return;
      }

      setAuth((previous) => ({
        ...previous,
        session,
        user: session.user,
        loading: true,
        error: null,
      }));

      setTimeout(async () => {
        const isAdmin = await checkAdminRole(session.user);
        if (mounted) {
          setAuth({
            session,
            user: session.user,
            isAdmin,
            loading: false,
            error: null,
          });
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  return auth;
};

async function checkAdminRole(user: User): Promise<boolean> {
  try {
    if (isConfiguredAdminEmail(user.email)) {
      return true;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Error fetching profile:", error);
      return false;
    }

    return isAdminRole(profile?.role);
  } catch (error: unknown) {
    console.error("[Auth] checkAdminRole error:", error);
    return false;
  }
}

const LoadingScreen: FC = () => (
  <div
    style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#1c1c1e",
      flexDirection: "column",
      gap: "16px",
    }}
  >
    <div
      className="spinner"
      style={{
        width: 48,
        height: 48,
        border: "3px solid #3a3a3c",
        borderTopColor: "#007aff",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    />
    <p style={{ color: "#8e8e93", fontSize: "14px" }}>
      Loading Edutu Admin...
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const UnauthorizedScreen: FC<{ error?: string }> = ({ error }) => (
  <div
    style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#1c1c1e",
      flexDirection: "column",
      gap: "16px",
      padding: "20px",
    }}
  >
    <div
      style={{
        width: 64,
        height: 64,
        background: "rgba(255, 59, 48, 0.1)",
        borderRadius: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AlertTriangle size={32} color="#ff3b30" />
    </div>
    <h1
      style={{ fontSize: "24px", fontWeight: 600, color: "white", margin: 0 }}
    >
      Access Denied
    </h1>
    <p
      style={{
        color: "#8e8e93",
        fontSize: "15px",
        maxWidth: "400px",
        textAlign: "center",
      }}
    >
      {error || "You do not have admin privileges to access this area."}
    </p>
    <button
      onClick={() => void signOutAdmin()}
      style={{
        padding: "12px 24px",
        background: "#007aff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Sign Out
    </button>
  </div>
);

const AppRoutes: FC = () => {
  const location = useLocation();
  const { session, isAdmin, loading, error } = useAuth();
  const isPasswordRecovery =
    location.pathname === RESET_PASSWORD_PATH ||
    location.hash.includes("type=recovery");
  const isAuthRoute =
    location.pathname === LOGIN_PATH || location.pathname === SIGNUP_PATH;

  if (isPasswordRecovery) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
          <Route
            path="*"
            element={<Navigate to={RESET_PASSWORD_PATH} replace />}
          />
        </Routes>
      </Suspense>
    );
  }

  if (loading) return <LoadingScreen />;

  if (!session || (!isAdmin && isAuthRoute)) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path={LOGIN_PATH} element={<Login />} />
          <Route path={SIGNUP_PATH} element={<Signup />} />
          <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
          <Route path="*" element={<Navigate to={LOGIN_PATH} replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (!isAdmin) return <UnauthorizedScreen error={error || undefined} />;

  return <AdminRoutes fallback={<LoadingScreen />} />;
};

const App: FC = () => <AppRoutes />;

export default App;
