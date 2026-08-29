import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EdutuForYouPage from "../../components/EdutuForYouPage";
import EdutuForYouBand from "../../components/EdutuForYouBand";
import EdutuForYouStoryPage from "../../components/EdutuForYouStoryPage";
import { PARTNER_EMAIL, WHATSAPP_JOIN_URL } from "../../lib/edutuForYou";
import { STORIES, STORY_ATTRIBUTION } from "../../lib/edutuForYouStories";

// Hoisted so useAuth()/useUser() return the same object every render — the
// public header reads both, and a fresh object per render churns effects.
const clerkMock = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, getToken: vi.fn() },
  user: { isLoaded: true, isSignedIn: false, user: null },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => clerkMock.auth,
  useUser: () => clerkMock.user,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: () => ({ isDarkMode: false, toggleDarkMode: vi.fn() }),
}));

beforeEach(() => {
  // Unstubbed fetch would hit the network; the service swallows the failure and
  // falls back to the seeds, which is exactly the path we want to exercise.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/edutuforyou"]}>
      <EdutuForYouPage />
    </MemoryRouter>,
  );
}

function renderStory(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/edutuforyou/stories/${slug}`]}>
      <Routes>
        <Route
          path="/edutuforyou/stories/:slug"
          element={<EdutuForYouStoryPage />}
        />
        <Route path="/edutuforyou" element={<div>program page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EdutuForYouPage", () => {
  it("renders the program headline", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        name: /door should not be harder/i,
        level: 1,
      }),
    ).toBeInTheDocument();
  });

  it("offers distinct partner and learner hero actions", () => {
    renderPage();

    expect(
      screen.getByRole("link", { name: /help open the next door/i }),
    ).toHaveAttribute("href", expect.stringContaining(`mailto:${PARTNER_EMAIL}`));
    expect(
      screen.getByRole("link", { name: /find my opportunities/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("opens with locally hosted learner photography", () => {
    renderPage();

    expect(
      screen.getByRole("img", {
        name: /young people working together on scholarship applications/i,
      }),
    ).toHaveAttribute("src", "/community/scholarships.jpg");
  });

  it("uses the Edutu mascot to guide the final choice", () => {
    renderPage();

    expect(
      screen.getByRole("img", { name: /edutu guide mascot/i }),
    ).toHaveAttribute("src", "/mascot/edutu-profile-guide.png");
  });

  it("presents the scholarship journey as an interactive text slideshow", async () => {
    renderPage();

    expect(
      screen.getByRole("region", { name: "Scholarship journey" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mastercard Foundation Scholars Program"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Next scholarship slide" }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/application asked for a story/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("tab", { name: /show slide 4/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Chevening became a next step/i),
      ).toBeInTheDocument();
    });
  });

  it("renders the learner journey with feature actions and a timeline", () => {
    renderPage();

    for (const label of [
      "Find my matches",
      "Build my application",
      "Meet the community",
      "Browse opportunities",
    ]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }

    expect(
      screen.getByRole("heading", { name: /a year in the program/i }),
    ).toBeInTheDocument();
    for (const stage of [
      "Month 1",
      "Months 2–3",
      "Months 4–6",
      "Months 7–9",
      "Months 10–12",
    ]) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it("renders the first three stories and reveals the rest on request", async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("link", {
          name: new RegExp(STORIES[0].name, "i"),
        }),
      ).toBeInTheDocument();
    });

    for (const story of STORIES.slice(0, 3)) {
      const link = screen.getByRole("link", {
        name: new RegExp(`${story.name}, ${story.age}`, "i"),
      });
      expect(link).toHaveAttribute(
        "href",
        `/edutuforyou/stories/${story.slug}`,
      );
    }

    expect(
      screen.queryByRole("link", {
        name: new RegExp(`${STORIES[3].name}, ${STORIES[3].age}`, "i"),
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /see more situations/i }),
    );
    expect(
      screen.getByRole("link", {
        name: new RegExp(`${STORIES[3].name}, ${STORIES[3].age}`, "i"),
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the seeded stories when the API is unreachable", async () => {
    renderPage();

    // fetch is stubbed to reject, so the service returns the bundled seeds and
    // the section renders the first three rather than going empty.
    await waitFor(() => {
      expect(
        screen.getAllByRole("link", {
          name: new RegExp(`${STORIES[0].name}, ${STORIES[0].age}`),
        }),
      ).toHaveLength(1);
    });

    for (const story of STORIES.slice(0, 3)) {
      expect(
        screen.getByText(story.quote, { exact: false }),
      ).toBeInTheDocument();
    }
  });

  it("labels every initially visible story as an illustrative composite", () => {
    renderPage();
    const storyLinks = screen
      .getAllByRole("link")
      .filter((link) => within(link).queryByText("Illustrative composite"));
    expect(storyLinks).toHaveLength(3);
  });

  // The attribution is the honesty guarantee for invented stories. It must be
  // present whenever any rendered story is still a composite.
  it("discloses that composite stories are not real users", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(STORY_ATTRIBUTION)).toBeInTheDocument();
    });
  });

  it("points every partner CTA at the partner mailbox", () => {
    renderPage();
    const links = screen
      .getAllByRole("link", { name: /partner with us/i })
      .map((node) => node.getAttribute("href"));

    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toContain(`mailto:${PARTNER_EMAIL}`);
      expect(href).toContain("subject=");
    }
  });

  it("adds a prominent partnership CTA below the partner lanes", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: /start a partnership conversation/i }),
    ).toHaveAttribute("href", expect.stringContaining(`mailto:${PARTNER_EMAIL}`));
  });

  it("opens the WhatsApp community in a new tab without leaking the referrer", () => {
    renderPage();
    for (const link of screen.getAllByRole("link", {
      name: /follow the community/i,
    })) {
      expect(link).toHaveAttribute("href", WHATSAPP_JOIN_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("sources every statistic on the gap cards", () => {
    renderPage();
    expect(
      screen.getByText("UN DESA, World Population Prospects"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Edutu platform data")).toHaveLength(2);
  });

  it("collapses and expands FAQ answers one at a time", () => {
    renderPage();
    const buttons = screen.getAllByRole("button", { name: /\?$/ });
    expect(buttons.length).toBeGreaterThan(1);

    // First item starts open.
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
  });
});

describe("EdutuForYouStoryPage", () => {
  it("renders the full story with every chapter", async () => {
    const story = STORIES[0];
    renderStory(story.slug);

    expect(
      screen.getByRole("heading", {
        name: new RegExp(`${story.name}, ${story.age}`),
        level: 1,
      }),
    ).toBeInTheDocument();

    for (const chapter of story.chapters) {
      expect(
        screen.getByRole("heading", { name: chapter.heading }),
      ).toBeInTheDocument();
      for (const paragraph of chapter.body) {
        expect(screen.getByText(paragraph)).toBeInTheDocument();
      }
    }
  });

  it("shows the attribution on a composite story", async () => {
    renderStory(STORIES[0].slug);
    await waitFor(() => {
      expect(screen.getByText(STORY_ATTRIBUTION)).toBeInTheDocument();
    });
  });

  it("links on to the next story", async () => {
    renderStory(STORIES[0].slug);
    await waitFor(() => {
      expect(screen.getByText(/next story/i)).toBeInTheDocument();
    });
    const nextLink = screen.getByText(/next story/i).closest("a");
    expect(nextLink).toHaveAttribute(
      "href",
      `/edutuforyou/stories/${STORIES[1].slug}`,
    );
  });

  it("redirects an unknown slug back to the program page", async () => {
    renderStory("not-a-real-story");
    await waitFor(() => {
      expect(screen.getByText("program page")).toBeInTheDocument();
    });
  });
});

describe("EdutuForYouBand", () => {
  function renderBand() {
    return render(
      <MemoryRouter>
        <EdutuForYouBand />
      </MemoryRouter>,
    );
  }

  it("carries exactly one call to action, pointing at the program page", () => {
    renderBand();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/edutuforyou");
    expect(links[0]).toHaveTextContent(/read more/i);
  });

  it("exposes the reach progress to assistive tech", () => {
    renderBand();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "1000000");
    expect(
      within(bar.parentElement as HTMLElement).getByText(
        /of 1,000,000 reached/i,
      ),
    ).toBeInTheDocument();
  });
});
