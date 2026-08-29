import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OpportunitiesPage from "../../components/OpportunitiesPage";
import "../../i18n";

const opportunityMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getToken: vi.fn(),
  explainOpportunity: vi.fn(),
  personalizeFeed: vi.fn((items: unknown[]) => items),
  trackInteraction: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  requirePro: vi.fn(() => false),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isSignedIn: false,
    userId: null,
    getToken: opportunityMocks.getToken,
  }),
  useUser: () => ({ user: null }),
}));

vi.mock("../../hooks/useOpportunities", () => ({
  useOpportunities: () => ({
    data: [],
    loading: true,
    error: null,
    refresh: opportunityMocks.refresh,
  }),
}));

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({
    explainOpportunity: opportunityMocks.explainOpportunity,
    isPersonalized: false,
    personalizeFeed: opportunityMocks.personalizeFeed,
    trackInteraction: opportunityMocks.trackInteraction,
  }),
}));

vi.mock("../../hooks/useServerMatchHydration", () => ({
  useServerMatchHydration: vi.fn(),
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: () => ({ isDarkMode: false }),
}));

vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({
    success: opportunityMocks.showSuccess,
    error: opportunityMocks.showError,
  }),
}));

vi.mock("../../components/ProGate", () => ({
  useProFeature: () => ({
    isPro: false,
    isLoading: false,
    locked: true,
    requirePro: opportunityMocks.requirePro,
  }),
}));

describe("OpportunitiesPage mobile title", () => {
  it("does not repeat the title when embedded in the app workspace", () => {
    render(
      <MemoryRouter initialEntries={["/app/opportunities"]}>
        <OpportunitiesPage embedded />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", { name: "Opportunities" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the title on the standalone Opportunities page", () => {
    render(
      <MemoryRouter initialEntries={["/opportunities"]}>
        <OpportunitiesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Opportunities" }),
    ).toBeInTheDocument();
  });
});
