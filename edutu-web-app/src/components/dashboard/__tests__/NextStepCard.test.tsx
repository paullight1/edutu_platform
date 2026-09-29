import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../i18n";
import NextStepCard from "../NextStepCard";
import type { OpportunityHomeView } from "../../../services/opportunityHome";

const renderCard = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

const home = {
  intent: { source: "explicit", goalKey: "study_funding" },
  featuredPursuitId: "journey-primary",
  nextAction: { key: "continue_task", label: "Request your transcript" },
  activePursuits: [
    {
      journey: {
        id: "journey-primary",
        opportunityId: "opportunity-primary",
        state: "preparing",
        priority: "primary",
        version: 1,
        eligibilityStatus: "likely",
      },
      opportunity: {
        id: "opportunity-primary",
        title: "North Star Scholarship",
      },
      nextAction: {
        key: "continue_task",
        label: "Request your transcript",
        taskId: "task-1",
        dueAt: null,
      },
      tasks: [],
    },
  ],
  recommendations: [
    {
      id: "opportunity-valid",
      title: "Future Leaders Award",
      imageUrl: "https://cdn.example.test/future-leaders.jpg",
      matchReasons: ["Fits your study goal"],
      matchRisks: [],
      eligibilityStatus: "unclear",
      eligibilityReasons: ["Confirm your graduation year"],
      eligibilityBlockers: [],
      deadline: "2027-01-15",
      daysUntilDeadline: 100,
    },
    {
      id: "opportunity-expired",
      title: "Expired Award",
      matchReasons: ["Looks like a fit"],
      matchRisks: [],
      eligibilityStatus: "eligible",
      eligibilityReasons: [],
      eligibilityBlockers: [],
      deadline: "2020-01-01",
      daysUntilDeadline: -1000,
    },
  ],
  degraded: false,
  degradedReasons: [],
} satisfies OpportunityHomeView;

describe("NextStepCard", () => {
  it("shows a clear live loading status while the next step is fetched", () => {
    renderCard(
      <NextStepCard
        home={null}
        state="loading"
        onContinuePlan={vi.fn()}
        onViewOpportunity={vi.fn()}
        onExplore={vi.fn()}
        onEditPreferences={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your next step",
    );
    expect(screen.getByRole("region")).toHaveAttribute("aria-busy", "true");
  });

  it("sends an active user to the plan for the featured primary pursuit", () => {
    const onContinuePlan = vi.fn();
    renderCard(
      <NextStepCard
        home={home}
        state="ready"
        onContinuePlan={onContinuePlan}
        onViewOpportunity={vi.fn()}
        onExplore={vi.fn()}
        onEditPreferences={vi.fn()}
      />,
    );

    expect(screen.getByText("Request your transcript")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue plan" }));
    expect(onContinuePlan).toHaveBeenCalledWith("journey-primary");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue plan: North Star Scholarship",
      }),
    );
    expect(onContinuePlan).toHaveBeenCalledTimes(2);
  });

  it("promotes a live recommendation and opens its existing opportunity detail", () => {
    const onViewOpportunity = vi.fn();
    renderCard(
      <NextStepCard
        home={{
          ...home,
          featuredPursuitId: null,
          nextAction: null,
          activePursuits: [],
        }}
        state="ready"
        onContinuePlan={vi.fn()}
        onViewOpportunity={onViewOpportunity}
        onExplore={vi.fn()}
        onEditPreferences={vi.fn()}
      />,
    );

    expect(screen.getByText("Future Leaders Award")).toBeInTheDocument();
    expect(screen.queryByText("Expired Award")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View opportunity" }));
    expect(onViewOpportunity).toHaveBeenCalledWith("opportunity-valid");
    fireEvent.click(
      screen.getByRole("button", {
        name: "View opportunity: Future Leaders Award",
      }),
    );
    expect(onViewOpportunity).toHaveBeenCalledTimes(2);
  });

  it("keeps an opportunity with a same-day deadline available", () => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOpportunity = {
      ...home.recommendations[0],
      id: "opportunity-due-today",
      title: "Closes today",
      deadline: today,
      daysUntilDeadline: 0,
    };
    renderCard(
      <NextStepCard
        home={{
          ...home,
          featuredPursuitId: null,
          nextAction: null,
          activePursuits: [],
          recommendations: [todayOpportunity],
        }}
        state="ready"
        onContinuePlan={vi.fn()}
        onViewOpportunity={vi.fn()}
        onExplore={vi.fn()}
        onEditPreferences={vi.fn()}
      />,
    );

    expect(screen.getByText("Closes today")).toBeInTheDocument();
  });

  it("shows a browse action when there is no active pursuit or safe recommendation", () => {
    const onExplore = vi.fn();
    renderCard(
      <NextStepCard
        home={{
          ...home,
          featuredPursuitId: null,
          nextAction: null,
          activePursuits: [],
          recommendations: [],
        }}
        state="ready"
        onContinuePlan={vi.fn()}
        onViewOpportunity={vi.fn()}
        onExplore={onExplore}
        onEditPreferences={vi.fn()}
      />,
    );

    const exploreActions = screen.getAllByRole("button", {
      name: "Explore opportunities",
    });
    fireEvent.click(exploreActions[exploreActions.length - 1]);
    expect(onExplore).toHaveBeenCalledOnce();
  });

  it("offers a browse route for an unavailable or empty response", () => {
    const onExplore = vi.fn();
    renderCard(
      <NextStepCard
        home={null}
        state="error"
        onContinuePlan={vi.fn()}
        onViewOpportunity={vi.fn()}
        onExplore={onExplore}
        onEditPreferences={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Explore opportunities" }),
    );
    expect(onExplore).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Next step unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status").querySelector('img[aria-hidden="true"]'),
    ).toHaveAttribute("src", "/illustrations/guidance-unavailable.svg");
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("labels inferred intent and offers a preference correction", () => {
    const onEditPreferences = vi.fn();
    const { container } = renderCard(
      <NextStepCard
        home={{
          ...home,
          intent: { source: "inferred" },
          featuredPursuitId: null,
          nextAction: null,
          activePursuits: [],
        }}
        state="ready"
        onContinuePlan={vi.fn()}
        onViewOpportunity={vi.fn()}
        onExplore={vi.fn()}
        onEditPreferences={onEditPreferences}
      />,
    );

    expect(screen.getByText("Based on your profile")).toBeInTheDocument();
    expect(screen.queryByText("Fits your study goal")).not.toBeInTheDocument();
    expect(container.querySelector('img[aria-hidden="true"]')).toHaveAttribute(
      "src",
      "https://cdn.example.test/future-leaders.jpg",
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit preferences" }));
    expect(onEditPreferences).toHaveBeenCalledOnce();
  });
});
