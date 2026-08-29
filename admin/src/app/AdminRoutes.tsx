import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "../components/Layout";
import BackgroundRunIndicator from "../features/engine/components/BackgroundRunIndicator";
import { EngineRunProvider } from "../features/engine/state/EngineRunProvider";
import AdminNotFound from "./AdminNotFound";
import {
  ADMIN_REDIRECTS,
  adminRoutePath,
  type AdminRouteId,
} from "./route-manifest";

const Dashboard = lazy(() => import("../pages/Dashboard"));
const Opportunities = lazy(() => import("../pages/Opportunities"));
const Events = lazy(() => import("../pages/Events"));
const Users = lazy(() => import("../pages/Users"));
const Creators = lazy(() => import("../pages/Creators"));
const CommunitySafety = lazy(() => import("../pages/CommunitySafety"));
const CommunitiesPage = lazy(
  () => import("../features/communities/CommunitiesPage"),
);
const Submissions = lazy(() => import("../pages/Submissions"));
const Roadmaps = lazy(() => import("../pages/Roadmaps"));
const MarketplaceReview = lazy(() => import("../pages/MarketplaceReview"));
const Blog = lazy(() => import("../pages/Blog"));
const ImpactStories = lazy(() => import("../pages/ImpactStories"));
const Settings = lazy(() => import("../pages/Settings"));
const EngineSourcesPage = lazy(
  () => import("../features/engine/pages/EngineSourcesPage"),
);
const EngineRunsPage = lazy(
  () => import("../features/engine/pages/EngineRunsPage"),
);
const EngineStatusPage = lazy(
  () => import("../features/engine/pages/EngineStatusPage"),
);
const MobileControl = lazy(() => import("../pages/MobileControl"));
const Monetization = lazy(() => import("../pages/Monetization"));
const Notifications = lazy(() => import("../pages/Notifications"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const Profile = lazy(() => import("../pages/Profile"));

interface AdminRoutesProps {
  fallback: ReactNode;
}

function childPath(id: AdminRouteId): string {
  return adminRoutePath(id).replace(/^\//u, "");
}

function redirectFor(from: string) {
  const redirect = ADMIN_REDIRECTS.find((entry) => entry.from === from);
  if (!redirect) throw new Error(`Unknown admin redirect: ${from}`);
  return redirect;
}

function childRedirectPath(from: string): string {
  return redirectFor(from).from.replace(/^\//u, "");
}

function EngineAwareLayout() {
  return (
    <EngineRunProvider>
      <BackgroundRunIndicator />
      <Layout />
    </EngineRunProvider>
  );
}

export default function AdminRoutes({ fallback }: AdminRoutesProps) {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route
          path={adminRoutePath("login")}
          element={<Navigate to={adminRoutePath("dashboard")} replace />}
        />
        <Route
          path={adminRoutePath("signup")}
          element={<Navigate to={adminRoutePath("dashboard")} replace />}
        />
        <Route
          path={adminRoutePath("reset-password")}
          element={<ResetPassword />}
        />
        <Route
          path={adminRoutePath("dashboard")}
          element={<EngineAwareLayout />}
        >
          <Route index element={<Dashboard />} />
          <Route
            path={childPath("opportunities")}
            element={<Opportunities />}
          />
          <Route path={childPath("submissions")} element={<Submissions />} />
          <Route path={childPath("events")} element={<Events />} />
          <Route path={childPath("users")} element={<Users />} />
          <Route path={childPath("creators")} element={<Creators />} />
          <Route path={childPath("communities")} element={<CommunitiesPage />} />
          <Route
            path={childPath("community-safety")}
            element={<CommunitySafety />}
          />
          <Route path={childPath("roadmaps")} element={<Roadmaps />} />
          <Route
            path={childPath("marketplace")}
            element={<MarketplaceReview />}
          />
          <Route path={childPath("blog")} element={<Blog />} />
          <Route
            path={childPath("impact-stories")}
            element={<ImpactStories />}
          />
          <Route path={childPath("settings")} element={<Settings />} />

          <Route
            path={childPath("engine-sources")}
            element={<EngineSourcesPage />}
          />
          <Route
            path={childPath("engine-runs")}
            element={<EngineRunsPage />}
          />
          <Route
            path={childPath("engine-status")}
            element={<EngineStatusPage />}
          />

          <Route path={childPath("app-home")} element={<MobileControl />} />
          <Route
            path={childPath("app-campaigns")}
            element={<MobileControl />}
          />
          <Route path={childPath("app-flags")} element={<MobileControl />} />
          <Route path={childPath("app-widgets")} element={<MobileControl />} />
          <Route path={childPath("app-control")} element={<MobileControl />} />

          <Route
            path={childPath("monetization-overview")}
            element={<Monetization />}
          />
          <Route
            path={childPath("monetization-pricing")}
            element={<Monetization />}
          />
          <Route
            path={childPath("monetization-transactions")}
            element={<Monetization />}
          />
          <Route
            path={childPath("monetization-usage")}
            element={<Monetization />}
          />

          <Route
            path={childPath("notifications")}
            element={<Notifications />}
          />
          <Route path={childPath("profile")} element={<Profile />} />

          <Route
            path={childRedirectPath("/dashboard")}
            element={<Navigate to={redirectFor("/dashboard").to} replace />}
          />
          <Route
            path={childRedirectPath("/edutu-engine")}
            element={
              <Navigate to={redirectFor("/edutu-engine").to} replace />
            }
          />
          <Route
            path={childRedirectPath("/mobile-control")}
            element={
              <Navigate to={redirectFor("/mobile-control").to} replace />
            }
          />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
