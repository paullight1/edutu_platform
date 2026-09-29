import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OpportunityDetail from "../../components/OpportunityDetail";
import type { Opportunity } from "../../types/opportunity";
import { createOpportunityJourney } from "../../services/opportunityJourneys";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    userId: "user-1",
    getToken: vi.fn().mockResolvedValue("token-1"),
  }),
}));

vi.mock("../../components/OpportunityDetailLegacy", () => ({
  default: () => <main data-testid="opportunity-main" />,
}));

vi.mock("../../services/opportunityJourneys", () => ({
  createOpportunityJourney: vi.fn(),
}));

vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="pathname">{location.pathname}</output>;
}

const opportunity = {
  id: "opportunity-1",
  title: "North Star Scholarship",
  category: "Scholarship",
  organization: "North Star",
  description: "Support for students.",
} as Opportunity;

describe("opportunity plan handoff", () => {
  it("opens the plan created by the confirmed add-to-plan action", async () => {
    vi.mocked(createOpportunityJourney).mockResolvedValue({
      journey: { id: "journey-42" },
    } as never);

    render(
      <MemoryRouter initialEntries={["/app/opportunity/opportunity-1"]}>
        <OpportunityDetail opportunity={opportunity} onBack={vi.fn()} embedded />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /add to my plan/i }));
    await screen.findByRole("button", { name: /view my plan/i });
    fireEvent.click(screen.getByRole("button", { name: /view my plan/i }));

    await waitFor(() => {
      expect(screen.getByTestId("pathname")).toHaveTextContent(
        "/app/my-plan/journey-42",
      );
    });
  });
});
