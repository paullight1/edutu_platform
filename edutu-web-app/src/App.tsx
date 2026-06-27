import {
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import AppWorkspaceShell from "./components/AppWorkspaceShell";
import PublicEditorialShell from "./components/PublicEditorialShell";
import GoogleOneTapGate from "./components/GoogleOneTapGate";
import PageSuspense from "./components/PageSuspense";
import { consumePostAuthRedirect } from "./lib/auth";
import { verifyAdminAccess } from "./lib/adminAccess";
import { useAuth as useAppAuth } from "./hooks/useAuth";
import { useAbsoluteSessionTimeout } from "./hooks/useAbsoluteSessionTimeout";

const AuthScreen = lazy(() => import("./components/AuthScreen"));
const AuthCallback = lazy(() => import("./components/AuthCallback"));
const ApplicationsPage = lazy(() => import("./components/ApplicationsPage"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const LandingPageV3 = lazy(() => import("./components/LandingPageV3"));
const OpportunitiesPage = lazy(() => import("./components/OpportunitiesPage"));
const OpportunityDetailFetcher = lazy(
  () => import("./components/OpportunityDetailFetcher"),
);
const OpportunitySharePage = lazy(
  () => import("./components/OpportunitySharePage"),
);
const EventsPage = lazy(() => import("./components/EventsPage"));
const EventDetailPage = lazy(() => import("./components/EventDetailPage"));
const AboutPage = lazy(() => import("./components/AboutPage"));
const BlogPage = lazy(() => import("./components/BlogPage"));
const MentorPage = lazy(() => import("./components/MentorPage"));
const DownloadPage = lazy(() => import("./components/DownloadPage"));
const ScholarshipApiPage = lazy(() => import("./components/ScholarshipApiPage"));
const DevelopersLandingPage = lazy(
  () => import("./components/DevelopersLandingPage"),
);
const DeveloperDashboardPage = lazy(
  () => import("./components/DeveloperDashboardPage"),
);
const DeadlinesPage = lazy(() => import("./components/DeadlinesPage"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const SavedPage = lazy(() => import("./components/SavedPage"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));

const ADMIN_PORTAL_URL =
  import.meta.env.VITE_ADMIN_URL || "https://admin.edutu.org";
const DOCS_SITE_URL = import.meta.env.VITE_DOCS_URL || "https://docs.edutu.org";
// When the Next.js marketing site is live, set VITE_MARKETING_URL (e.g.
// https://www.edutu.org) and the public marketing routes redirect there.
const MARKETING_SITE_URL = import.meta.env.VITE_MARKETING_URL || "";

type AdminGateState =
  | { status: "checking"; message?: string }
  | { status: "allowed"; url: string }
  | { status: "denied"; message: string };

export type Screen =
  | "landing"
  | "auth"
  | "dashboard"
  | "opportunities"
  | "saved"
  | "applied"
  | "profile"
  | "settings"
  | "notifications"
  | "privacy"
  | "help"
  | "personalization"
  | "community-marketplace"
  | "achievements"
  | "creator-apply"
  | "creator-dashboard"
  | "creator-create"
  | "deadlines"
  | "about"
  | "blog";

function buildAdminPortalUrl(location: ReturnType<typeof useLocation>): string | null {
  try {
    const base = new URL(ADMIN_PORTAL_URL, window.location.origin);

    if (import.meta.env.PROD && base.protocol !== "https:") {
      return null;
    }

    const requestedAdminPath = location.pathname
      .replace(/^\/admin\/?/, "")
      .replace(/^\/+/, "");
    const basePath = base.pathname.replace(/\/+$/, "");
    base.pathname = requestedAdminPath
      ? `${basePath}/${requestedAdminPath}`.replace(/\/{2,}/g, "/")
      : basePath || "/";
    base.search = location.search;
    base.hash = location.hash;

    return base.toString();
  } catch {
    return null;
  }
}

function AdminAccessDenied({ message }: { message: string }) {
  const navigate = useNavigate();

  return (
    <PublicEditorialShell>
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 text-left shadow-sm dark:border-white/10 dark:bg-slate-950">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Admin access denied
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {message}
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard", { replace: true })}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Open dashboard
            </button>
          </div>
        </div>
      </div>
    </PublicEditorialShell>
  );
}

function AdminPortalGate() {
  const location = useLocation();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const [gate, setGate] = useState<AdminGateState>({
    status: "checking",
    message: "Checking admin access",
  });

  useEffect(() => {
    let isActive = true;

    async function verifyAccess() {
      if (!isLoaded || !isSignedIn) return;

      const nextUrl = buildAdminPortalUrl(location);
      if (!nextUrl) {
        setGate({
          status: "denied",
          message:
            "The admin portal URL is not configured safely. Contact the Edutu team before trying again.",
        });
        return;
      }

      try {
        const token = await getToken();

        if (!token) {
          throw new Error("Missing authenticated session token");
        }

        await verifyAdminAccess(token);

        if (!isActive) return;
        setGate({ status: "allowed", url: nextUrl });
        window.location.assign(nextUrl);
      } catch {
        if (!isActive) return;
        setGate({
          status: "denied",
          message:
            "This account is signed in, but it does not have permission to open Edutu admin.",
        });
      }
    }

    void verifyAccess();

    return () => {
      isActive = false;
    };
  }, [getToken, isLoaded, isSignedIn, location]);

  if (!isLoaded) {
    return (
      <PublicEditorialShell>
        <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500/25 border-t-brand-500" />
            Checking session
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

  if (gate.status === "denied") {
    return <AdminAccessDenied message={gate.message} />;
  }

  return (
    <PublicEditorialShell>
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {gate.status === "allowed"
              ? "Opening the admin portal"
              : gate.message || "Checking admin access"}
          </p>
        </div>
      </div>
    </PublicEditorialShell>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
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

function DocsRedirect() {
  useEffect(() => {
    window.location.replace(DOCS_SITE_URL);
  }, []);

  return (
    <PublicEditorialShell>
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Opening Scholarship Engine docs
          </p>
        </div>
      </div>
    </PublicEditorialShell>
  );
}

/**
 * When VITE_MARKETING_URL is set (i.e. the Next.js marketing site is live),
 * redirect public marketing routes there so there is ONE marketing surface.
 * Until then, render the in-app fallback page so nothing breaks.
 */
function MarketingRedirect({
  path,
  fallback,
}: {
  path: string;
  fallback: ReactNode;
}) {
  useEffect(() => {
    if (!MARKETING_SITE_URL) return;
    try {
      window.location.replace(new URL(path, MARKETING_SITE_URL).toString());
    } catch {
      // invalid URL — fall through to the in-app page
    }
  }, [path]);

  if (!MARKETING_SITE_URL) {
    return <>{fallback}</>;
  }

  return (
    <PublicEditorialShell>
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Opening Edutu
          </p>
        </div>
      </div>
    </PublicEditorialShell>
  );
}

function UserDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAppAuth();

  const openOpportunity = useCallback(
    (opportunity: { id?: string }) => {
      if (!opportunity?.id) return;
      navigate(`/app/opportunity/${opportunity.id}`);
    },
    [navigate],
  );

  const openAppRoute = useCallback(
    (screen: string) => {
      if (screen === "opportunities" || screen.startsWith("opportunities?")) {
        navigate(`/app/${screen}`);
        return;
      }

      if (
        screen === "deadlines" ||
        screen === "saved" ||
        screen === "applied" ||
        screen === "profile"
      ) {
        if (screen === "applied") {
          navigate("/app/applications");
          return;
        }
        navigate(`/app/${screen}`);
        return;
      }

      if (screen === "home") {
        navigate("/dashboard");
      }
    },
    [navigate],
  );

  return (
    <Dashboard
      user={user}
      onOpportunityClick={openOpportunity}
      onViewAllOpportunities={() => navigate("/app/opportunities")}
      onNavigate={openAppRoute}
      embeddedDesktopShell
    />
  );
}

function AppWorkspaceRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppWorkspaceShell>{children}</AppWorkspaceShell>
    </ProtectedRoute>
  );
}

function App() {
  const navigate = useNavigate();
  const { isSignedIn } = useClerkAuth();
  const { signOut } = useAppAuth();

  useAbsoluteSessionTimeout(signOut);

  const handleAuthSuccess = useCallback(
    (_userData: unknown) => {
      navigate(consumePostAuthRedirect("/dashboard"), { replace: true });
    },
    [navigate],
  );

  const handleGetStarted = useCallback(() => {
    navigate(isSignedIn ? "/dashboard" : "/auth?mode=sign-in");
  }, [isSignedIn, navigate]);

  return (
    <>
      <GoogleOneTapGate />
      <Suspense fallback={<PageSuspense />}>
        <Routes>
      <Route
        path="/"
        element={<LandingPageV3 onGetStarted={handleGetStarted} />}
      />
      <Route
        path="/dashboard"
        element={
          <AppWorkspaceRoute>
            <UserDashboardPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/home"
        element={
          <AppWorkspaceRoute>
            <UserDashboardPage />
          </AppWorkspaceRoute>
        }
      />
      <Route path="/opportunities" element={<OpportunitiesPage />} />
      <Route
        path="/app/opportunities"
        element={
          <AppWorkspaceRoute>
            <OpportunitiesPage embedded />
          </AppWorkspaceRoute>
        }
      />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/events/:slugOrId" element={<EventDetailPage />} />
      <Route path="/mentor" element={<MentorPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/docs" element={<DocsRedirect />} />
      <Route
        path="/scholarship-engine"
        element={
          <MarketingRedirect path="/scholarship-api" fallback={<ScholarshipApiPage />} />
        }
      />
      <Route
        path="/scholarship-api"
        element={
          <MarketingRedirect
            path="/scholarship-api"
            fallback={<Navigate to="/scholarship-engine" replace />}
          />
        }
      />
      <Route
        path="/developers"
        element={
          <MarketingRedirect path="/scholarship-api" fallback={<DevelopersLandingPage />} />
        }
      />
      <Route
        path="/dashboard/developer"
        element={
          <ProtectedRoute>
            <DeveloperDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/coach" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/coach" element={<Navigate to="/dashboard" replace />} />
      <Route path="/cv" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/cv" element={<Navigate to="/dashboard" replace />} />
      <Route path="/roadmaps" element={<Navigate to="/dashboard" replace />} />
      <Route path="/roadmaps/:id" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/roadmaps" element={<Navigate to="/dashboard" replace />} />
      <Route path="/roadmap-templates" element={<Navigate to="/dashboard" replace />} />
      <Route path="/templates" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/roadmap-templates" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/saved"
        element={
          <AppWorkspaceRoute>
            <SavedPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/saved"
        element={
          <AppWorkspaceRoute>
            <SavedPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <AppWorkspaceRoute>
            <ApplicationsPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/applied"
        element={<Navigate to="/applications" replace />}
      />
      <Route
        path="/app/applications"
        element={
          <AppWorkspaceRoute>
            <ApplicationsPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/applied"
        element={<Navigate to="/app/applications" replace />}
      />
      <Route
        path="/profile"
        element={
          <AppWorkspaceRoute>
            <ProfilePage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/profile"
        element={
          <AppWorkspaceRoute>
            <ProfilePage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <AppWorkspaceRoute>
            <SettingsPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/settings"
        element={
          <AppWorkspaceRoute>
            <SettingsPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/deadlines"
        element={
          <AppWorkspaceRoute>
            <DeadlinesPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/app/deadlines"
        element={
          <AppWorkspaceRoute>
            <DeadlinesPage />
          </AppWorkspaceRoute>
        }
      />
      <Route path="/goals" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/goals" element={<Navigate to="/dashboard" replace />} />
      <Route path="/wallet" element={<Navigate to="/dashboard" replace />} />
      <Route path="/premium" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/wallet" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/opportunity/:id"
        element={
          <OpportunityDetailFetcher onBack={() => navigate("/opportunities")} />
        }
      />
      <Route
        path="/app/opportunity/:id"
        element={
          <AppWorkspaceRoute>
            <OpportunityDetailFetcher
              onBack={() => navigate("/app/opportunities")}
              embedded
            />
          </AppWorkspaceRoute>
        }
      />
      <Route path="/share/opportunity/:id" element={<OpportunitySharePage />} />
      <Route
        path="/auth"
        element={<AuthScreen onAuthSuccess={handleAuthSuccess} />}
      />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/login"
        element={<Navigate to="/auth?mode=sign-in" replace />}
      />
      <Route
        path="/signup"
        element={<Navigate to="/auth?signup=true" replace />}
      />
      <Route path="/admin/*" element={<AdminPortalGate />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
      </Suspense>
    </>
  );
}

export { App as default };
