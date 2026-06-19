import { type ReactNode, useCallback, useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import AuthScreen from "./components/AuthScreen";
import AuthCallback from "./components/AuthCallback";
import AppWorkspaceShell from "./components/AppWorkspaceShell";
import ApplicationsPage from "./components/ApplicationsPage";
import Dashboard from "./components/Dashboard";
import LandingPageV3 from "./components/LandingPageV3";
import OpportunitiesPage from "./components/OpportunitiesPage";
import OpportunityDetailFetcher from "./components/OpportunityDetailFetcher";
import OpportunitySharePage from "./components/OpportunitySharePage";
import EventsPage from "./components/EventsPage";
import EventDetailPage from "./components/EventDetailPage";
import AboutPage from "./components/AboutPage";
import BlogPage from "./components/BlogPage";
import MentorPage from "./components/MentorPage";
import DownloadPage from "./components/DownloadPage";
import DeveloperDocsPage from "./components/DeveloperDocsPage";
import ScholarshipApiPage from "./components/ScholarshipApiPage";
import PublicEditorialShell from "./components/PublicEditorialShell";
import DeadlinesPage from "./components/DeadlinesPage";
import ProfilePage from "./components/ProfilePage";
import SavedPage from "./components/SavedPage";
import SettingsPage from "./components/SettingsPage";
import { consumePostAuthRedirect } from "./lib/auth";
import { useAuth as useAppAuth } from "./hooks/useAuth";

const ADMIN_PORTAL_URL =
  import.meta.env.VITE_ADMIN_URL || "https://admin.edutu.org";

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

function ExternalAdminRedirect() {
  useEffect(() => {
    window.location.replace(ADMIN_PORTAL_URL);
  }, []);

  return (
    <PublicEditorialShell>
      <div className="flex min-h-[calc(100dvh-180px)] items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-500/25 border-t-brand-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Opening the admin portal
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
      if (screen === "opportunities") {
        navigate("/app/opportunities");
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
      <Route path="/docs" element={<DeveloperDocsPage />} />
      <Route path="/scholarship-api" element={<ScholarshipApiPage />} />
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
      <Route path="/admin/*" element={<ExternalAdminRedirect />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export { App as default };
