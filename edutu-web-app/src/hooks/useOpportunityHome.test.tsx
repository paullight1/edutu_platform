import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpportunityHome } from "./useOpportunityHome";
import { getOpportunityHome } from "../services/opportunityJourney";

vi.mock("../services/opportunityJourney", async () => {
  const actual = await vi.importActual<typeof import("../services/opportunityJourney")>(
    "../services/opportunityJourney",
  );
  return { ...actual, getOpportunityHome: vi.fn() };
});

const mockedGetHome = vi.mocked(getOpportunityHome);

describe("useOpportunityHome", () => {
  beforeEach(() => {
    mockedGetHome.mockReset();
  });

  it("does not request data when the rollout flag is disabled", () => {
    const { result } = renderHook(() =>
      useOpportunityHome({ token: "token", enabled: false }),
    );
    expect(mockedGetHome).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("loads and exposes degraded state", async () => {
    mockedGetHome.mockResolvedValue({
      generatedAt: "2026-09-03T00:00:00Z",
      intent: {} as never,
      nextAction: null,
      activePursuits: [],
      recommendations: [],
      degraded: true,
      degradedReasons: ["personalized_recommendations_unavailable"],
      limits: {
        recommendationDefault: 3,
        recommendationMaximum: 5,
        primaryActiveMaximum: 1,
        secondaryActiveMaximum: 2,
      },
    });

    const { result } = renderHook(() =>
      useOpportunityHome({ token: "token", enabled: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.data?.degradedReasons).toEqual([
      "personalized_recommendations_unavailable",
    ]);
  });

  it("keeps request failures visible and supports an explicit retry", async () => {
    mockedGetHome
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        generatedAt: "2026-09-03T00:00:00Z",
        intent: {} as never,
        nextAction: null,
        activePursuits: [],
        recommendations: [],
        degraded: false,
        degradedReasons: [],
        limits: {
          recommendationDefault: 3,
          recommendationMaximum: 5,
          primaryActiveMaximum: 1,
          secondaryActiveMaximum: 2,
        },
      });

    const { result } = renderHook(() =>
      useOpportunityHome({ token: "token", enabled: true }),
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
  });
});
