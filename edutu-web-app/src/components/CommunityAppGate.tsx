import { Suspense, type ReactNode } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazyWithRetry as lazy } from "../lib/lazyWithRetry";
import { isNativePlatform } from "../lib/capacitor";
import App from "../App";
import PageSuspense from "./PageSuspense";
import PublicEditorialShell from "./PublicEditorialShell";

const CommunityCallPage = lazy(() => import("./CommunityCallPage"));

export function isCommunityProductPath(pathname: string): boolean {
  return pathname.startsWith("/communities/calls/");
}

function ProtectedCommunityRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isLoaded, isSignedIn } = useClerkAuth();

  if (!isLoaded) {
    return (
      <PublicEditorialShell>
        <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500/25 border-t-brand-500" />
            Checking membership
          </div>
        </div>
      </PublicEditorialShell>
    );
  }

  if (!isSignedIn) {
    return (
      <Navigate
        to="/auth?mode=sign-in"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        }}
      />
    );
  }

  return children;
}

function CommunityCallRoute() {
  if (!isNativePlatform) {
    return <Navigate to="/app/community" replace />;
  }

  return (
    <ProtectedCommunityRoute>
      <CommunityCallPage />
    </ProtectedCommunityRoute>
  );
}

function CommunityProductRoutes() {
  return (
    <Suspense fallback={<PageSuspense />}>
      <Routes>
        <Route
          path="/communities/calls/:callId"
          element={<CommunityCallRoute />}
        />
        <Route path="*" element={<Navigate to="/app/community" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function CommunityAppGate() {
  const location = useLocation();
  if (!isCommunityProductPath(location.pathname)) return <App />;
  return <CommunityProductRoutes />;
}
