import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";
import type { Opportunity } from "../../types/opportunity";

const opportunity: Opportunity = {
  id: "opp-1",
  title: "Global Scholars Fellowship",
  description: "A funded fellowship for emerging leaders.",
  category: "Fellowship",
  organization: "Global Scholars Network",
  location: "Remote",
  deadline: "2026-11-30T00:00:00.000Z",
  image: "/fellowship.png",
} as Opportunity;

const personalization = {
  preferences: null,
  personalizeFeed: (rows: Opportunity[]) => rows,
  trackInteraction: vi.fn(),
  explainOpportunity: () => ({ score: 42, reasons: ["Matches your goals"] }),
  isPersonalized: true,
  ready: true,
  refresh: vi.fn(),
};

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("test-token"),
    sessionId: "session-1",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "dashboard.sections.exploreOpportunities": "Explore opportunities",
        "dashboard.sections.recommendedPicks": "Recommended picks",
        "dashboard.completeProfile": "Complete your profile",
        "dashboard.needForMatches": "Need 60% for matches",
        "dashboard.forYou": "For you",
        "dashboard.shuffle": "Shuffle",
        "dashboard.viewMore": "View more",
      })[key] ?? key,
  }),
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: () => ({ isDarkMode: true }),
}));

vi.mock("../../hooks/useOpportunities", () => ({
  useOpportunities: () => ({
    data: [opportunity],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../hooks/usePersonalizedOpportunities", () => ({
  usePersonalizedOpportunities: () => ({
    data: [opportunity],
    loading: false,
    error: null,
    refresh: vi.fn(),
    setUserProfile: vi.fn(),
  }),
}));

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => personalization,
}));

vi.mock("../../hooks/usePWA", () => ({
  usePWA: () => ({
    isInstallable: false,
    isInstalled: true,
    isManualInstallAvailable: false,
    promptInstall: vi.fn(),
  }),
}));

vi.mock("../../services/profile", () => ({
  fetchBackendProfile: vi.fn().mockResolvedValue({
    completeness: {
      percent: 10,
      missing: [{ label: "Field of study" }],
    },
  }),
}));

vi.mock("../../services/webConfig", () => ({
  fetchHeroBanners: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/bookmarks", () => ({
  addBookmark: vi.fn(),
  getBookmarks: vi.fn().mockResolvedValue([]),
  removeBookmark: vi.fn(),
}));

vi.mock("../../services/applications", () => ({
  getApplications: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/deadlines", () => ({
  getDeadlines: vi.fn().mockResolvedValue({
    groups: [],
    summary: {
      total: 0,
      overdue: 0,
      urgent: 0,
      soon: 0,
      thisWeek: 0,
      critical: 0,
    },
  }),
}));

vi.mock("../../services/events", () => ({
  fetchEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("../ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("./ProfileCompletionPrompt", () => ({
  ProfileCompletionPrompt: () => null,
}));

describe("Dashboard desktop priority layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("groups profile readiness, calendar, and empty best shots as dashboard priorities", async () => {
    render(
      <MemoryRouter>
        <Dashboard
          user={{ id: "user-1", name: "Ada Student" } as never}
          onOpportunityClick={vi.fn()}
          onViewAllOpportunities={vi.fn()}
        />
      </MemoryRouter>,
    );

    const priorities = await screen.findByRole("region", {
      name: /dashboard priorities/i,
    });

    await waitFor(() => {
      expect(
        within(priorities).getByText("Complete your profile"),
      ).toBeInTheDocument();
    });
    expect(
      within(priorities).getByRole("link", {
        name: /calendar and upcoming/i,
      }),
    ).toBeInTheDocument();
    expect(within(priorities).getByText("Your Best Shots")).toBeInTheDocument();
  });

  it("places the desktop promotion after the recommended opportunity cards", async () => {
    render(
      <MemoryRouter>
        <Dashboard
          user={{ id: "user-1", name: "Ada Student" } as never}
          onOpportunityClick={vi.fn()}
          onViewAllOpportunities={vi.fn()}
        />
      </MemoryRouter>,
    );

    const opportunityButtons = await screen.findAllByRole("button", {
      name: /open global scholars fellowship/i,
    });
    const promotionLinks = screen.getAllByRole("link", {
      name: /edutu is landing in your browser/i,
    });
    const desktopOpportunity =
      opportunityButtons[opportunityButtons.length - 1];
    const desktopPromotion = promotionLinks[promotionLinks.length - 1];

    expect(desktopOpportunity).toBeDefined();
    expect(desktopPromotion).toBeDefined();
    expect(
      desktopOpportunity!.compareDocumentPosition(desktopPromotion!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("exposes recommendation controls as one labelled toolbar", async () => {
    render(
      <MemoryRouter>
        <Dashboard
          user={{ id: "user-1", name: "Ada Student" } as never}
          onOpportunityClick={vi.fn()}
          onViewAllOpportunities={vi.fn()}
        />
      </MemoryRouter>,
    );

    const recommendations = await screen.findByRole("region", {
      name: /recommended picks/i,
    });

    expect(
      within(recommendations).getByRole("toolbar", {
        name: /view and organize recommendations/i,
      }),
    ).toBeInTheDocument();
  });
});
