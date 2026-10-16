import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPageV3 from "../../components/LandingPageV3";
import type { Opportunity } from "../../types/opportunity";

const opportunityState = vi.hoisted(() => ({
  data: [] as Opportunity[],
  error: null as string | null,
  refresh: vi.fn(),
}));
const opportunityShuffleState = vi.hoisted(() => ({ seed: 42 }));

vi.mock("../../lib/opportunityShuffle", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../lib/opportunityShuffle")
  >();

  return {
    ...actual,
    createOpportunityShuffleSeed: () => opportunityShuffleState.seed,
  };
});

vi.mock("../../hooks/useOpportunities", () => ({
  useOpportunities: () => ({
    data: opportunityState.data,
    loading: false,
    error: opportunityState.error,
    refresh: opportunityState.refresh,
  }),
}));

vi.mock("../../services/blog", () => ({
  fetchPublishedPosts: vi.fn().mockResolvedValue([]),
  formatPostDate: vi.fn(),
  readingTime: vi.fn(),
}));

vi.mock("../../services/webConfig", () => ({
  DEFAULT_WEB_ANNOUNCEMENT: {
    enabled: false,
    text: "",
    linkLabel: "",
    linkUrl: "",
  },
  fetchWebAnnouncement: vi.fn().mockResolvedValue({
    enabled: false,
    text: "",
    linkLabel: "",
    linkUrl: "",
  }),
  normalizeWebLink: (value: string) => value,
}));

vi.mock("../../components/HomepageHeader", () => ({ default: () => null }));
vi.mock("../../components/SiteFooter", () => ({ default: () => null }));
vi.mock("../../components/PageSeo", () => ({ default: () => null }));
vi.mock("../../components/CommunityShowcase", () => ({ default: () => null }));
vi.mock("../../components/EdutuForYouBand", () => ({ default: () => null }));
vi.mock("../../components/EventsHomeSection", () => ({ default: () => null }));

const makeOpportunity = (
  id: string,
  overrides: Partial<Opportunity> = {},
): Opportunity => ({
  id,
  title: `Opportunity ${id}`,
  organization: "Edutu Test",
  category: "Scholarship",
  location: "Global",
  description: "A test opportunity",
  requirements: [],
  benefits: [],
  applicationProcess: [],
  match: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

afterEach(() => {
  opportunityState.data = [];
  opportunityState.error = null;
  opportunityState.refresh.mockReset();
  opportunityShuffleState.seed = 42;
  vi.restoreAllMocks();
});

describe("LandingPageV3 country reach", () => {
  it("offers retry when the home opportunity teaser cannot load", () => {
    opportunityState.error = "Opportunities are temporarily unavailable. Please try again.";

    render(
      <MemoryRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("We couldn't load the latest opportunities just now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(opportunityState.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders two country rows moving in opposite directions", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </MemoryRouter>,
    );

    const rows = container.querySelectorAll(".landing-marquee");

    expect(rows).toHaveLength(2);
    expect(rows[0].parentElement).toHaveAttribute("dir", "ltr");
    expect(rows[0]).toHaveClass("landing-marquee--forward");
    expect(rows[1]).toHaveClass("landing-marquee--reverse");
  });

  it("does not place a What's New promotion between the hero and opportunities", () => {
    render(
      <MemoryRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("heading", {
        name: /edutu just got sharper, calmer, and more dependable/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /a good place to start/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows only opportunities that are currently available", () => {
    opportunityState.data = [
      makeOpportunity("expired", {
        deadline: "2000-01-01T00:00:00.000Z",
        createdAt: "2099-12-31T00:00:00.000Z",
      }),
      makeOpportunity("not-open-yet", {
        openDate: "2099-01-01T00:00:00.000Z",
        createdAt: "2099-12-30T00:00:00.000Z",
      }),
      ...Array.from({ length: 7 }, (_, index) =>
        makeOpportunity(`open-${index + 1}`),
      ),
    ];

    const { container } = render(
      <MemoryRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </MemoryRouter>,
    );

    const opportunityLinks = container.querySelectorAll(
      'a[href^="/share/opportunity/"]',
    );

    expect(opportunityLinks).toHaveLength(6);
    expect(container.querySelector('a[href$="/expired"]')).not.toBeInTheDocument();
    expect(
      container.querySelector('a[href$="/not-open-yet"]'),
    ).not.toBeInTheDocument();
  });

  it("selects six available opportunities in a seeded random order", () => {
    opportunityState.data = Array.from({ length: 8 }, (_, index) =>
      makeOpportunity(`open-${index + 1}`),
    );

    const { container } = render(
      <MemoryRouter>
        <LandingPageV3 onGetStarted={vi.fn()} />
      </MemoryRouter>,
    );

    const renderedIds = Array.from(
      container.querySelectorAll('a[href^="/share/opportunity/"]'),
      (link) => link.getAttribute("href")?.split("/").pop(),
    );

    expect(renderedIds).toEqual([
      "open-3",
      "open-7",
      "open-8",
      "open-6",
      "open-2",
      "open-5",
    ]);
  });
});
