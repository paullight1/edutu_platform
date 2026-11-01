import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "../../hooks/useTheme";
import OpportunitySharePage from "../../components/OpportunitySharePage";
import OpportunityDetailFetcher from "../../components/OpportunityDetailFetcher";

const serviceMocks = vi.hoisted(() => ({
  getOpportunity: vi.fn(),
}));

vi.mock("../../services/opportunities", () => ({
  getCachedOpportunitySync: () => null,
  getOpportunity: serviceMocks.getOpportunity,
}));

// Image generation can take much longer than the public opportunity read.
// Opening an old shared link must not wait for it.
vi.mock("../../services/opportunityShare", () => ({
  fetchOpportunityShareCard: () => new Promise(() => {}),
}));

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="Current location">{location.pathname}{location.search}{location.hash}</output>;
}

function renderSharePage(entry = "/share/opportunity/opp-123") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <CurrentLocation />
        <Routes>
          <Route path="/share/opportunity/:id" element={<OpportunitySharePage />} />
          <Route path="/opportunity/:id" element={<OpportunityDetailFetcher onBack={() => {}} />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("OpportunitySharePage", () => {
  beforeEach(() => {
    serviceMocks.getOpportunity.mockReset();
    serviceMocks.getOpportunity.mockResolvedValue(null);
  });

  it("opens the public detail route without waiting for share-card generation", async () => {
    renderSharePage("/share/opportunity/opp-123?source=message#details");

    expect(await screen.findByRole("heading", { name: "This opportunity is no longer available" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current location")).toHaveTextContent("/opportunity/opp-123?source=message#details");
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/auth?mode=sign-in&screen=full");
    expect(screen.getByRole("link", { name: /browse opportunities/i })).toHaveAttribute("href", "/opportunities");
  });

  it("offers retry after a failed read instead of showing a blank shared card", async () => {
    serviceMocks.getOpportunity.mockRejectedValueOnce(new Error("Connection lost"));
    renderSharePage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this opportunity");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "This opportunity is no longer available" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
