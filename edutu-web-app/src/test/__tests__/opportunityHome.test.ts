import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOpportunityHome } from "../../services/opportunityHome";
import { productApiRequest } from "../../services/productApi";

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));

const activeHome = {
  intent: { source: "explicit", goalKey: "study_funding" },
  featuredPursuitId: "journey-1",
  nextAction: { key: "continue_task", label: "Request your transcript" },
  activePursuits: [
    {
      journey: {
        id: "journey-1",
        opportunityId: "opportunity-1",
        state: "preparing",
        priority: "primary",
        version: 2,
        eligibilityStatus: "unclear",
      },
      opportunity: { id: "opportunity-1", title: "North Star Scholarship" },
      nextAction: {
        key: "continue_task",
        label: "Request your transcript",
        taskId: "task-1",
        dueAt: null,
      },
      tasks: [],
      progress: { completedRequired: 1, totalRequired: 3, percent: 33 },
    },
  ],
  recommendations: [
    {
      id: "opportunity-2",
      title: "Future Leaders Award",
      matchReasons: ["Fits your study goal"],
      matchRisks: ["Confirm your graduation year"],
      eligibilityStatus: "unclear",
      eligibilityReasons: ["Graduation year is not in your profile"],
      eligibilityBlockers: [],
      deadline: "2026-12-15T00:00:00.000Z",
      daysUntilDeadline: 78,
    },
  ],
  degraded: false,
  degradedReasons: [],
};

describe("getOpportunityHome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches the existing home endpoint and returns a typed active action", async () => {
    vi.mocked(productApiRequest).mockResolvedValue(activeHome);

    await expect(getOpportunityHome("token-1")).resolves.toMatchObject({
      featuredPursuitId: "journey-1",
      nextAction: { label: "Request your transcript" },
      activePursuits: [{ opportunity: { title: "North Star Scholarship" } }],
      recommendations: [{ eligibilityStatus: "unclear" }],
    });
    expect(productApiRequest).toHaveBeenCalledWith(
      "/me/opportunity-home",
      "token-1",
    );
  });

  it("keeps the active action if recommendation data is malformed", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({
      ...activeHome,
      recommendations: [{ id: 42, title: null }],
    });

    await expect(getOpportunityHome("token-1")).resolves.toMatchObject({
      featuredPursuitId: "journey-1",
      nextAction: { label: "Request your transcript" },
      recommendations: [],
    });
  });

  it("normalizes an empty home response", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({
      intent: null,
      featuredPursuitId: null,
      nextAction: null,
      activePursuits: [],
      recommendations: [],
      degraded: true,
      degradedReasons: ["personalized_recommendations_unavailable"],
    });

    await expect(getOpportunityHome("token-1")).resolves.toMatchObject({
      featuredPursuitId: null,
      nextAction: null,
      activePursuits: [],
      recommendations: [],
      degraded: true,
    });
  });

  it("rejects a malformed top-level contract and passes API errors through", async () => {
    vi.mocked(productApiRequest).mockResolvedValue({ activePursuits: "broken" });
    await expect(getOpportunityHome("token-1")).rejects.toThrow();

    vi.mocked(productApiRequest).mockRejectedValue(new Error("API unavailable"));
    await expect(getOpportunityHome("token-1")).rejects.toThrow("API unavailable");
  });
});
