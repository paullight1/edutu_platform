import { render, screen } from "@testing-library/react";
import { Outlet, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminRoot from "../../admin/AdminRoot";

const adminPageMocks = vi.hoisted(() => ({
  dashboard: () => <div>Admin dashboard section</div>,
  opportunities: () => <div>Admin opportunities section</div>,
  users: () => <div>Admin users section</div>,
  creators: () => <div>Admin creators section</div>,
  roadmaps: () => <div>Admin roadmaps section</div>,
  blog: () => <div>Admin blog section</div>,
  settings: () => <div>Admin settings section</div>,
  scraper: () => <div>Admin scraper section</div>,
  mobileControl: () => <div>Admin mobile control section</div>,
  profile: () => <div>Admin profile section</div>,
  payments: () => <div>Admin payments section</div>,
  notifications: () => <div>Admin notifications section</div>,
  analytics: () => <div>Admin analytics section</div>,
}));

vi.mock("../../admin/legacy/components/LegacyAdminLayout", () => ({
  default: () => <Outlet />,
}));

vi.mock("../../admin/legacy/pages/Dashboard", () => ({
  default: adminPageMocks.dashboard,
}));
vi.mock("../../admin/legacy/pages/Opportunities", () => ({
  default: adminPageMocks.opportunities,
}));
vi.mock("../../admin/legacy/pages/Users", () => ({
  default: adminPageMocks.users,
}));
vi.mock("../../admin/legacy/pages/Creators", () => ({
  default: adminPageMocks.creators,
}));
vi.mock("../../admin/legacy/pages/Roadmaps", () => ({
  default: adminPageMocks.roadmaps,
}));
vi.mock("../../admin/legacy/pages/Blog", () => ({
  default: adminPageMocks.blog,
}));
vi.mock("../../admin/legacy/pages/Settings", () => ({
  default: adminPageMocks.settings,
}));
vi.mock("../../admin/legacy/pages/Scraper", () => ({
  default: adminPageMocks.scraper,
}));
vi.mock("../../admin/legacy/pages/MobileControl", () => ({
  default: adminPageMocks.mobileControl,
}));
vi.mock("../../admin/legacy/pages/Profile", () => ({
  default: adminPageMocks.profile,
}));
vi.mock("../../admin/pages/PaymentsPage", () => ({
  default: adminPageMocks.payments,
}));
vi.mock("../../admin/pages/NotificationsPage", () => ({
  default: adminPageMocks.notifications,
}));
vi.mock("../../admin/pages/PlaceholderPages", () => ({
  AnalyticsPage: adminPageMocks.analytics,
}));

function renderAdminRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoot />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminRoot sections", () => {
  it("renders the dashboard section at /admin", () => {
    renderAdminRoute("/admin");

    expect(screen.getByText("Admin dashboard section")).toBeInTheDocument();
  });

  it("renders the payments and notifications sections", () => {
    renderAdminRoute("/admin/payments");
    expect(screen.getByText("Admin payments section")).toBeInTheDocument();

    renderAdminRoute("/admin/notifications");
    expect(screen.getByText("Admin notifications section")).toBeInTheDocument();
  });

  it("renders the remaining admin sections", () => {
    renderAdminRoute("/admin/analytics");
    expect(screen.getByText("Admin analytics section")).toBeInTheDocument();

    renderAdminRoute("/admin/settings");
    expect(screen.getByText("Admin settings section")).toBeInTheDocument();
  });
});
