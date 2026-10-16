import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpportunityDetail from "../../components/OpportunityDetail";
import type { Opportunity } from "../../types/opportunity";
import { createOpportunityJourney } from "../../services/opportunityJourneys";

const mocks = vi.hoisted(() => ({ userId: "user-1" as string | null }));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    userId: mocks.userId,
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
  return (
    <output data-testid="location">
      {location.pathname}{location.search}
    </output>
  );
}

const opportunity = {
  id: "opportunity-1",
  title: "North Star Scholarship",
  category: "Scholarship",
  organization: "North Star",
  description: "Support for students.",
} as Opportunity;

describe("opportunity plan handoff", () => {
  afterEach(() => {
    mocks.userId = "user-1";
  });

  it("keeps deadline facts readable and shows the full opportunity artwork", async () => {
    render(
      <MemoryRouter initialEntries={["/opportunity/opportunity-1"]}>
        <OpportunityDetail
          opportunity={
            {
              ...opportunity,
              deadline: "2026-11-01",
              image: "https://example.test/opportunity-flyer.png",
            } as Opportunity
          }
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );

    const facts = await screen.findByTestId("opportunity-detail-facts");
    expect(facts).toHaveClass("grid-cols-1");
    expect(facts).not.toHaveClass("xl:grid-cols-4");
    expect(screen.getByText("1 Nov 2026")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "North Star Scholarship opportunity image" }),
    ).toHaveClass("object-contain");
  });

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
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/app/my-plan/journey-42",
      );
    });
  });

  it("preserves the opportunity return path through sign-in and OAuth", async () => {
    mocks.userId = null;
    render(
      <MemoryRouter initialEntries={["/app/opportunity/opportunity-1"]}>
        <OpportunityDetail opportunity={opportunity} onBack={vi.fn()} embedded />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /add to my plan/i }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/auth?mode=sign-in&redirect=%2Fapp%2Fopportunity%2Fopportunity-1",
      );
    });
    mocks.userId = "user-1";
  });
});
