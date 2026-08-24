import type { FC } from "react";
import { lazy, Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AdminRoutes from "./app/AdminRoutes";
import { adminRoutePath } from "./app/route-manifest";
import { AdminAuthProvider } from "./auth/AdminAuthProvider";
import { useAdminAuth } from "./auth/admin-auth-context";

const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const LOGIN_PATH = adminRoutePath("login");
const SIGNUP_PATH = adminRoutePath("signup");
const RESET_PASSWORD_PATH = adminRoutePath("reset-password");

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

const UnauthorizedScreen: FC<{
  error?: string;
  onSignOut(): Promise<void>;
}> = ({ error, onSignOut }) => (
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
      type="button"
      onClick={() => void onSignOut()}
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
  const { session, isAdmin, loading, error, signOut } = useAdminAuth();
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

  if (!isAdmin) {
    return (
      <UnauthorizedScreen error={error || undefined} onSignOut={signOut} />
    );
  }

  return <AdminRoutes fallback={<LoadingScreen />} />;
};

const App: FC = () => (
  <AdminAuthProvider>
    <AppRoutes />
  </AdminAuthProvider>
);

export default App;
