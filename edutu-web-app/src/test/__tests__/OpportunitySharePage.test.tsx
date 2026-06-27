import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "../../hooks/useTheme";
import OpportunitySharePage from "../../components/OpportunitySharePage";

const serviceMocks = vi.hoisted(() => ({
  fetchOpportunityShareCard: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn().mockResolvedValue("token-123"),
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: false,
    user: null,
  }),
  useClerk: () => ({
    signOut: vi.fn(),
  }),
}));

vi.mock("../../services/opportunityShare", () => ({
  fetchOpportunityShareCard: serviceMocks.fetchOpportunityShareCard,
}));

function renderSharePage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/share/opportunity/opp-123"]}>
        <Routes>
          <Route
            path="/share/opportunity/:id"
            element={<OpportunitySharePage />}
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("OpportunitySharePage", () => {
  beforeEach(() => {
    serviceMocks.fetchOpportunityShareCard.mockReset();
    serviceMocks.fetchOpportunityShareCard.mockResolvedValue({
      url: "https://cdn.example.com/share.png",
      path: "share/opp-123.png",
      format: "png",
      generatedAt: "2026-06-18T09:00:00.000Z",
      fingerprint: "abc123",
      expiresAt: null,
      shareText: [
        "Still Active!",
        "",
        "Global Leadership Fellowship",
        "",
        "Sponsor: Edutu Foundation",
        "",
        "Benefits:",
        "- Full details available on Edutu",
        "",
        "Category: Fellowship",
        "Eligible Country: Worldwide",
        "Deadline: August 1, 2026",
        "",
        "Open the link below to view the preview.",
        "https://www.edutu.org/share/opportunity/opp-123",
        "",
        "Share this with anyone who needs the link.",
      ].join("\n"),
      shareUrl: "https://www.edutu.org/share/opportunity/opp-123",
    });
  });

  it("renders the public preview and sign-in actions", async () => {
    renderSharePage();

    expect(
      await screen.findByText("Global Leadership Fellowship"),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/auth?mode=sign-in",
    );
    expect(
      screen.getByRole("link", { name: /browse opportunities/i }),
    ).toHaveAttribute("href", "/opportunities");
  });
});
