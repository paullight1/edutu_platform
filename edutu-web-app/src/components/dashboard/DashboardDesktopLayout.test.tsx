import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";
import type { Opportunity } from "../../types/opportunity";
import { fetchBackendProfile } from "../../services/profile";

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

const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken,
    sessionId: "session-1",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      ({
        "workspace.greeting": `Greetings ${options?.name ?? "there"}`,
        "dashboard.sections.exploreOpportunities": "Explore opportunities",
        "dashboard.sections.recommendedPicks": "Explore opportunities",
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

vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}));

vi.mock("../../lib/clerkToken", () => ({
  getProductApiToken: vi.fn().mockResolvedValue("test-token"),
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

vi.mock("../../services/opportunityHome", () => ({
  getOpportunityHome: vi.fn().mockResolvedValue({
    intent: null,
    featuredPursuitId: null,
    nextAction: null,
    activePursuits: [],
    recommendations: [
      {
        id: "opp-1",
        title: "Global Scholars Fellowship",
        eligibilityStatus: "eligible",
        daysUntilDeadline: 30,
      },
    ],
    degraded: false,
    degradedReasons: [],
  }),
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
  ProfileCompletionPrompt: ({ open, onDismiss }: { open: boolean; onDismiss: () => void }) =>
    open ? <div role="dialog" aria-label="Welcome to Edutu"><button onClick={onDismiss}>Maybe later</button></div> : null,
}));

describe("Dashboard desktop priority layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("does not repeat the My Plan announcement above the next-step card", async () => {
    render(
      <MemoryRouter>
        <Dashboard
          user={{ id: "user-1", name: "Ada Student" } as never}
          onOpportunityClick={vi.fn()}
          onViewAllOpportunities={vi.fn()}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("region", { name: /explore opportunities/i });
    expect(screen.queryByRole("region", { name: /edutu update/i })).toBeNull();
  });

  it("groups profile readiness and calendar while keeping recommendations unified", async () => {
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
    expect(
      screen.getByRole("heading", { name: /explore opportunities/i }),
    ).toBeInTheDocument();
  });

  it("gives the desktop home a clear heading and task shortcuts", async () => {
    render(
      <MemoryRouter>
        <Dashboard
          user={{ id: "user-1", name: "Ada Student" } as never}
          onOpportunityClick={vi.fn()}
          onViewAllOpportunities={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Greetings Ada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your next steps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Explore opportunities" }),
    ).toBeInTheDocument();
  });

  it("places the compact desktop promotion before opportunity recommendations", async () => {
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
      desktopPromotion!.compareDocumentPosition(desktopOpportunity!) &
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
      name: /explore opportunities/i,
    });

    expect(
      within(recommendations).getByRole("toolbar", {
        name: /view and organize recommendations/i,
      }),
    ).toBeInTheDocument();
  });

  it("focuses the next-step card when onboarding returns with the focus marker", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <MemoryRouter initialEntries={["/dashboard?focus=next-step"]}>
          <Dashboard
            user={{ id: "user-1", name: "Ada Student" } as never}
            onOpportunityClick={vi.fn()}
            onViewAllOpportunities={vi.fn()}
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        const card = document.getElementById("guidance-next-step");
        expect(card).not.toBeNull();
        expect(document.activeElement).toBe(card);
      });
      expect(scrollIntoView).toHaveBeenCalledOnce();
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
  });

  it("welcomes a Google signup before profile data arrives and consumes the welcome marker on dismissal", async () => {
    vi.mocked(fetchBackendProfile).mockReturnValueOnce(new Promise(() => {}));
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="current-route">{location.pathname}{location.search}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/dashboard?welcome=google&category=Scholarships"]}>
        <Dashboard user={{ id: "user-1", name: "Ada Student" } as never} onOpportunityClick={vi.fn()} onViewAllOpportunities={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: "Welcome to Edutu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("current-route")).toHaveTextContent("/dashboard?category=Scholarships");
  });
});
