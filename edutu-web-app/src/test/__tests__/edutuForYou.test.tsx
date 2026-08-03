import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import EdutuForYouPage from "../../components/EdutuForYouPage";
import EdutuForYouBand from "../../components/EdutuForYouBand";
import {
  COMPOSITE_LABEL,
  PARTNER_EMAIL,
  STORIES,
  WHATSAPP_JOIN_URL,
} from "../../lib/edutuForYou";

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/edutuforyou"]}>
      <EdutuForYouPage />
    </MemoryRouter>,
  );
}

describe("EdutuForYouPage", () => {
  it("renders the program headline", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /talent is everywhere/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("points every partner CTA at the partner mailbox with a prefilled subject", () => {
    renderPage();
    const partnerLinks = screen
      .getAllByRole("link", { name: /partner with us/i })
      .map((node) => node.getAttribute("href"));

    expect(partnerLinks.length).toBeGreaterThan(0);
    for (const href of partnerLinks) {
      expect(href).toContain(`mailto:${PARTNER_EMAIL}`);
      expect(href).toContain("subject=");
    }
  });

  it("opens the WhatsApp community in a new tab without leaking the referrer", () => {
    renderPage();
    const joinLinks = screen.getAllByRole("link", {
      name: /follow the community/i,
    });

    expect(joinLinks.length).toBeGreaterThan(0);
    for (const link of joinLinks) {
      expect(link).toHaveAttribute("href", WHATSAPP_JOIN_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  // The composite labelling is the page's honesty guarantee, not decoration:
  // an unlabelled fictional testimonial on an impact page is a trust problem.
  it("labels every story as an illustrative composite", () => {
    renderPage();
    expect(screen.getAllByText(COMPOSITE_LABEL)).toHaveLength(STORIES.length);
  });

  it("discloses that the stories are composites rather than alumni", () => {
    renderPage();
    expect(screen.getByText(/not alumni we have already served/i)).toBeInTheDocument();
  });

  it("expands and collapses a story on Read more", () => {
    renderPage();
    const story = STORIES[0];
    const toggle = screen.getByRole("button", {
      name: new RegExp(`read ${story.name}'s story`, "i"),
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(story.barrier)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(story.barrier)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(
      screen.getByRole("button", {
        name: new RegExp(`read ${story.name}'s story`, "i"),
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("sources every statistic on the gap cards", () => {
    renderPage();
    // Two external figures plus two of our own — none unattributed.
    expect(screen.getByText("UN DESA, World Population Prospects")).toBeInTheDocument();
    expect(screen.getByText("African Development Bank")).toBeInTheDocument();
    expect(screen.getAllByText("Edutu platform data")).toHaveLength(2);
  });

  it("cross-links to the research on /impact", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: /read the research behind this/i }),
    ).toHaveAttribute("href", "/impact");
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

  it("links through to the program page", () => {
    renderBand();
    expect(
      screen.getByRole("link", { name: /read the mission/i }),
    ).toHaveAttribute("href", "/edutuforyou");
  });

  it("carries both the partner and join CTAs", () => {
    renderBand();
    expect(
      screen.getByRole("link", { name: /partner with us/i }),
    ).toHaveAttribute("href", expect.stringContaining(`mailto:${PARTNER_EMAIL}`));
    expect(
      screen.getByRole("link", { name: /follow the community/i }),
    ).toHaveAttribute("href", WHATSAPP_JOIN_URL);
  });

  it("exposes the reach progress to assistive tech", () => {
    renderBand();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "1000000");
    expect(within(bar.parentElement as HTMLElement).getByText(/of 1,000,000 reached/i)).toBeInTheDocument();
  });
});
