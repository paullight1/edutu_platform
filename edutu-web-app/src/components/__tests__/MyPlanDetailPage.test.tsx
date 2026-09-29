import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyPlanDetailPage from "../MyPlanDetailPage";
import type { OpportunityJourneyView } from "../../services/opportunityJourneys";
import {
  confirmApplication,
  getOpportunityJourney,
  markApplicationOpened,
} from "../../services/opportunityJourneys";

const { getTokenMock, translate } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  translate: (key: string) => key,
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("../../services/opportunityJourneys", () => ({
  getOpportunityJourney: vi.fn(),
  updateJourneyTask: vi.fn(),
  markApplicationOpened: vi.fn(),
  confirmApplication: vi.fn(),
  recordJourneyOutcome: vi.fn(),
}));

const journey = (
  state: "ready_to_apply" | "application_opened" | "applied",
): OpportunityJourneyView => ({
  journey: {
    id: "journey-1",
    opportunityId: "opportunity-1",
    state,
    priority: "primary",
    version: state === "ready_to_apply" ? 2 : 3,
    eligibilityStatus: "eligible",
  },
  opportunity: {
    title: "North Star",
    organization: "North Star Fund",
    applyUrl: "https://example.org/apply",
  },
  tasks: [],
  nextAction:
    state === "ready_to_apply"
      ? {
          key: "open_application",
          label: "Open application",
          taskId: null,
          dueAt: null,
        }
      : state === "application_opened"
        ? {
            key: "confirm_application",
            label: "Confirm application status",
            taskId: null,
            dueAt: null,
          }
        : {
            key: "update_outcome",
            label: "Update application",
            taskId: null,
            dueAt: null,
          },
  progress: { completedRequired: 2, totalRequired: 2, percent: 100 },
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/my-plan/journey-1"]}>
      <Routes>
        <Route path="/app/my-plan/:id" element={<MyPlanDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MyPlanDetailPage application confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue("token");
  });

  it("records opening only after the API confirms it and still asks the user to confirm submission", async () => {
    vi.mocked(getOpportunityJourney).mockResolvedValue(
      journey("ready_to_apply"),
    );
    let resolveOpened!: (view: OpportunityJourneyView) => void;
    vi.mocked(markApplicationOpened).mockReturnValue(
      new Promise((resolve) => {
        resolveOpened = resolve;
      }),
    );

    renderPage();
    const link = await screen.findByRole("link", {
      name: /myPlan.openApplication/i,
    });
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(link);

    await waitFor(() =>
      expect(markApplicationOpened).toHaveBeenCalledWith(
        "journey-1",
        2,
        "token",
      ),
    );
    expect(
      screen.getByText("myPlan.states.ready_to_apply"),
    ).toBeInTheDocument();

    resolveOpened(journey("application_opened"));
    expect(
      await screen.findByRole("button", { name: /myPlan.confirmSubmitted/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("myPlan.states.application_opened"),
    ).toBeInTheDocument();
  });

  it("does not mark a submission as applied until the confirmation request succeeds", async () => {
    vi.mocked(getOpportunityJourney).mockResolvedValue(
      journey("application_opened"),
    );
    let resolveConfirmed!: (view: OpportunityJourneyView) => void;
    vi.mocked(confirmApplication).mockReturnValue(
      new Promise((resolve) => {
        resolveConfirmed = resolve;
      }),
    );

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /myPlan.confirmSubmitted/i }),
    );
    await waitFor(() =>
      expect(confirmApplication).toHaveBeenCalledWith("journey-1", 3, "token"),
    );
    expect(
      screen.getByText("myPlan.states.application_opened"),
    ).toBeInTheDocument();

    resolveConfirmed(journey("applied"));
    expect(
      await screen.findByText("myPlan.states.applied"),
    ).toBeInTheDocument();
  });
});
