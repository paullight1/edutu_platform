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
import ApplicationsPage from "./components/ApplicationsPage";
import Dashboard from "./components/Dashboard";
import OpportunitiesPage from "./components/OpportunitiesPage";
import OpportunityDetailFetcher from "./components/OpportunityDetailFetcher";
import OpportunitySharePage from "./components/OpportunitySharePage";
import EventsPage from "./components/EventsPage";
import EventDetailPage from "./components/EventDetailPage";
import PublicEditorialShell from "./components/PublicEditorialShell";
import CoachPage from "./components/CoachPage";
import CvPage from "./components/CvPage";
import DeadlinesPage from "./components/DeadlinesPage";
import GoalsPage from "./components/GoalsPage";
import ProfilePage from "./components/ProfilePage";
import RoadmapDetailPage from "./components/RoadmapDetailPage";
import RoadmapsPage from "./components/RoadmapsPage";
import RoadmapTemplatesPage from "./components/RoadmapTemplatesPage";
import SavedPage from "./components/SavedPage";
import WalletPage from "./components/WalletPage";
import { consumePostAuthRedirect } from "./lib/auth";
import { useAuth as useAppAuth } from "./hooks/useAuth";

const ADMIN_PORTAL_URL =
  import.meta.env.VITE_ADMIN_URL || "https://admin.edutu.org";

export type Screen =
  | "landing"
  | "auth"
  | "dashboard"
  | "opportunities"
  | "coach"
  | "cv"
  | "roadmaps"
  | "roadmap-templates"
  | "saved"
  | "applied"
  | "profile"
  | "settings"
  | "notifications"
  | "wallet"
  | "privacy"
  | "help"
  | "cv-management"
  | "personalization"
  | "community-marketplace"
  | "achievements"
  | "creator-apply"
  | "creator-dashboard"
  | "creator-create"
  | "deadlines"
  | "goals"
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
      navigate(`/opportunity/${opportunity.id}`);
    },
    [navigate],
  );

  const openAppRoute = useCallback(
    (screen: string) => {
      if (screen === "opportunities") {
        navigate("/opportunities");
        return;
      }

      if (screen === "wallet" || screen === "premium") {
        navigate("/wallet");
        return;
      }

      if (
        screen === "coach" ||
        screen === "deadlines" ||
        screen === "goals" ||
        screen === "cv" ||
        screen === "cv-management" ||
        screen === "roadmaps" ||
        screen === "roadmap-templates" ||
        screen === "templates" ||
        screen === "saved" ||
        screen === "applied" ||
        screen === "profile"
      ) {
        if (screen === "cv-management") {
          navigate("/cv");
          return;
        }
        if (screen === "applied") {
          navigate("/applications");
          return;
        }
        if (screen === "templates") {
          navigate("/roadmap-templates");
          return;
        }
        navigate(`/${screen}`);
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
      onViewAllOpportunities={() => navigate("/opportunities")}
      onNavigate={openAppRoute}
    />
  );
}

function App() {
  const navigate = useNavigate();

  const handleAuthSuccess = useCallback(
    (_userData: unknown) => {
      navigate(consumePostAuthRedirect("/dashboard"), { replace: true });
    },
    [navigate],
  );

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <UserDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/home"
        element={
          <ProtectedRoute>
            <UserDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/opportunities" element={<OpportunitiesPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/events/:slugOrId" element={<EventDetailPage />} />
      <Route
        path="/coach"
        element={
          <ProtectedRoute>
            <CoachPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/coach"
        element={
          <ProtectedRoute>
            <CoachPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cv"
        element={
          <ProtectedRoute>
            <CvPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/cv"
        element={
          <ProtectedRoute>
            <CvPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roadmaps"
        element={
          <ProtectedRoute>
            <RoadmapsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roadmaps/:id"
        element={
          <ProtectedRoute>
            <RoadmapDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/roadmaps"
        element={
          <ProtectedRoute>
            <RoadmapsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roadmap-templates"
        element={
          <ProtectedRoute>
            <RoadmapTemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={<Navigate to="/roadmap-templates" replace />}
      />
      <Route
        path="/app/roadmap-templates"
        element={
          <ProtectedRoute>
            <RoadmapTemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saved"
        element={
          <ProtectedRoute>
            <SavedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/saved"
        element={
          <ProtectedRoute>
            <SavedPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <ProtectedRoute>
            <ApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applied"
        element={<Navigate to="/applications" replace />}
      />
      <Route
        path="/app/applications"
        element={
          <ProtectedRoute>
            <ApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/applied"
        element={<Navigate to="/applications" replace />}
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deadlines"
        element={
          <ProtectedRoute>
            <DeadlinesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/deadlines"
        element={
          <ProtectedRoute>
            <DeadlinesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <GoalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/goals"
        element={
          <ProtectedRoute>
            <GoalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wallet"
        element={
          <ProtectedRoute>
            <WalletPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/premium"
        element={
          <ProtectedRoute>
            <WalletPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/wallet"
        element={
          <ProtectedRoute>
            <WalletPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/opportunity/:id"
        element={
          <OpportunityDetailFetcher onBack={() => navigate("/opportunities")} />
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
