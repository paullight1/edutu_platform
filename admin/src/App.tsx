import type { FC } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { signOutAdmin } from "./lib/auth";
import { isAdminRole, isConfiguredAdminEmail } from "./lib/adminAccess";
import {
  getLocalAdminEmail,
  getLocalAdminUserId,
  isLocalAdminBypassEnabled,
} from "./lib/localAdmin";
import Layout from "./components/Layout";
import { AlertTriangle } from "lucide-react";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const Events = lazy(() => import("./pages/Events"));
const Users = lazy(() => import("./pages/Users"));
const Creators = lazy(() => import("./pages/Creators"));
const Roadmaps = lazy(() => import("./pages/Roadmaps"));
const Blog = lazy(() => import("./pages/Blog"));
const Settings = lazy(() => import("./pages/Settings"));
const Scraper = lazy(() => import("./pages/Scraper"));
const MobileControl = lazy(() => import("./pages/MobileControl"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));

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
          window.location.pathname === "/reset-password" ||
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

        // Use a faster check
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
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Auth initialization failed",
          }));
        }
      }
    }

    // Safety timeout
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setAuth((prev) => {
          if (!prev.loading) return prev;
          console.warn("[Auth] Auth state check timed out globally");
          return { ...prev, loading: false, error: "Auth Timeout" };
        });
      }
    }, 10000);

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
        window.location.pathname === "/reset-password" ||
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
      if (mounted) {
        if (!session?.user) {
          setAuth({
            session: null,
            user: null,
            isAdmin: false,
            loading: false,
            error: null,
          });
        } else {
          setAuth((prev) => ({
            ...prev,
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
        }
      }
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
    <p style={{ color: "#8e8e93", fontSize: "14px" }}>Loading Edutu Admin...</p>
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
    location.pathname === "/reset-password" ||
    location.hash.includes("type=recovery");
  const isAuthRoute =
    location.pathname === "/login" || location.pathname === "/signup";

  if (isPasswordRecovery) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/reset-password" replace />} />
      </Routes>
    );
  }

  if (loading) return <LoadingScreen />;

  if (!session || (!isAdmin && isAuthRoute)) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!isAdmin) return <UnauthorizedScreen error={error || undefined} />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="events" element={<Events />} />
          <Route path="users" element={<Users />} />
          <Route path="creators" element={<Creators />} />
          <Route path="roadmaps" element={<Roadmaps />} />
          <Route path="blog" element={<Blog />} />
          <Route path="settings" element={<Settings />} />
          <Route path="edutu-engine" element={<Scraper />} />
          <Route path="mobile-control" element={<MobileControl />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

const App: FC = () => <AppRoutes />;

export default App;
