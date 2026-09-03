import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpportunityJourney } from "./useOpportunityJourney";
import {
  OpportunityJourneyApiError,
  confirmOpportunityApplication,
  getOpportunityJourney,
  markOpportunityApplicationOpened,
  updateOpportunityJourneyTask,
  type OpportunityJourneyView,
} from "../services/opportunityJourney";

vi.mock("../services/opportunityJourney", async () => {
  const actual = await vi.importActual<typeof import("../services/opportunityJourney")>(
    "../services/opportunityJourney",
  );
  return {
    ...actual,
    getOpportunityJourney: vi.fn(),
    updateOpportunityJourneyTask: vi.fn(),
    markOpportunityApplicationOpened: vi.fn(),
    confirmOpportunityApplication: vi.fn(),
  };
});

const baseJourney: OpportunityJourneyView = {
  journey: {
    id: "journey-1",
    opportunityId: "opportunity-1",
    state: "preparing",
    priority: "primary",
    eligibilityStatus: "eligible",
    eligibilityConfidence: 1,
    version: 2,
    nextActionAt: null,
    committedAt: null,
    applyLinkOpenedAt: null,
    appliedAt: null,
    closedAt: null,
    outcome: null,
  },
  opportunity: { title: "Opportunity" },
  tasks: [],
  nextAction: {
    key: "continue_task",
    label: "Collect transcript",
    taskId: "task-1",
    dueAt: null,
  },
  progress: { completedRequired: 0, totalRequired: 1, percent: 0 },
};

describe("useOpportunityJourney", () => {
  beforeEach(() => {
    vi.mocked(getOpportunityJourney).mockReset();
    vi.mocked(updateOpportunityJourneyTask).mockReset();
    vi.mocked(markOpportunityApplicationOpened).mockReset();
    vi.mocked(confirmOpportunityApplication).mockReset();
    vi.mocked(getOpportunityJourney).mockResolvedValue(baseJourney);
  });

  it("loads one journey and uses its current version for task mutations", async () => {
    vi.mocked(updateOpportunityJourneyTask).mockResolvedValue({
      ...baseJourney,
      journey: { ...baseJourney.journey, version: 3, state: "ready_to_apply" },
    });

    const { result } = renderHook(() =>
      useOpportunityJourney({
        token: "token",
        journeyId: "journey-1",
      }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await result.current.updateTask("task-1", "completed");
    });

    expect(updateOpportunityJourneyTask).toHaveBeenCalledWith(
      "token",
      "journey-1",
      "task-1",
      expect.objectContaining({
        expectedVersion: 2,
        status: "completed",
        idempotencyKey: expect.stringMatching(/^task-task-1-completed:/),
      }),
    );
    expect(result.current.data?.journey.version).toBe(3);
  });

  it("replaces local journey state with the server row after a version conflict", async () => {
    vi.mocked(updateOpportunityJourneyTask).mockRejectedValue(
      new OpportunityJourneyApiError("changed elsewhere", 409, {
        code: "JOURNEY_VERSION_CONFLICT",
        currentJourney: {
          ...baseJourney.journey,
          state: "application_opened",
          version: 5,
        },
      }),
    );

    const { result } = renderHook(() =>
      useOpportunityJourney({ token: "token", journeyId: "journey-1" }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await expect(
        result.current.updateTask("task-1", "completed"),
      ).rejects.toThrow("changed elsewhere");
    });

    expect(result.current.data?.journey).toMatchObject({
      state: "application_opened",
      version: 5,
    });
    expect(result.current.error).toBeInstanceOf(OpportunityJourneyApiError);
  });

  it("exposes distinct application-open and confirmation actions", async () => {
    vi.mocked(markOpportunityApplicationOpened).mockResolvedValue({
      ...baseJourney,
      journey: {
        ...baseJourney.journey,
        state: "application_opened",
        version: 3,
      },
    });
    vi.mocked(confirmOpportunityApplication).mockResolvedValue({
      ...baseJourney,
      journey: {
        ...baseJourney.journey,
        state: "applied",
        version: 4,
      },
    });

    const { result } = renderHook(() =>
      useOpportunityJourney({ token: "token", journeyId: "journey-1" }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await result.current.markApplicationOpened();
    });
    expect(markOpportunityApplicationOpened).toHaveBeenCalledTimes(1);
    expect(confirmOpportunityApplication).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmApplication();
    });
    expect(confirmOpportunityApplication).toHaveBeenCalledWith(
      "token",
      "journey-1",
      expect.objectContaining({ expectedVersion: 3 }),
    );
  });
});
