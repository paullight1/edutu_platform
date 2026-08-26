import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CommunityLandingPage from "../../features/community/CommunityLandingPage";
import PublicCommunityGroupPage from "../../features/community/PublicCommunityGroupPage";

vi.mock("@clerk/clerk-react", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@clerk/clerk-react");
  return { ...actual, useAuth: () => ({ isSignedIn: false }) };
});

// These tests exercise route metadata and public community copy, not the
// already-covered global header/footer provider wiring. Keeping the shell out
// makes the failure boundary precise: an SEO regression fails here instead of
// Clerk/Theme context requirements from unrelated site chrome.
vi.mock("../../components/PublicHeader", () => ({
  default: () => <header data-testid="public-header">Edutu</header>,
}));
vi.mock("../../components/SiteFooter", () => ({
  default: () => <footer data-testid="site-footer">Edutu</footer>,
}));

vi.mock("../../features/community/publicApi", () => ({
  fetchPublicGroups: vi.fn().mockResolvedValue([
    {
      id: "group-1",
      slug: "chevening-2027-abc123",
      name: "Chevening 2027",
      description: "Applicants preparing together.",
      coverEmoji: "🎓",
      memberCount: 24,
      messageCount: 91,
      opportunityId: null,
      expiresAt: "2026-12-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ]),
  fetchPublicGroup: vi.fn().mockResolvedValue({
    id: "group-1",
    slug: "chevening-2027-abc123",
    name: "Chevening 2027",
    description: "Applicants preparing together.",
    coverEmoji: "🎓",
    memberCount: 24,
    messageCount: 91,
    opportunityId: null,
    expiresAt: "2026-12-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
  }),
}));

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('[data-seo="true"]').forEach((node) => node.remove());
});

describe("community public SEO", () => {
  it("uses a query-relevant community title and does not publish fabricated scale stats", async () => {
    render(<MemoryRouter><CommunityLandingPage /></MemoryRouter>);

    await waitFor(() => {
      expect(document.title).toContain("Scholarship & Career Community");
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/community/i);
    expect(document.body.textContent).not.toContain("50K+");
    expect(document.body.textContent).not.toContain("800+");
    expect(document.body.textContent).not.toContain("3.2K");
  });

  it("gives a public group its real name in the title and canonical URL", async () => {
    render(
      <MemoryRouter initialEntries={["/community/groups/chevening-2027-abc123"]}>
        <Routes>
          <Route path="/community/groups/:slug" element={<PublicCommunityGroupPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { level: 1, name: "Chevening 2027" });
    await waitFor(() => expect(document.title).toBe("Chevening 2027 Community | Edutu"));
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toContain("/community/groups/chevening-2027-abc123");
  });
});
