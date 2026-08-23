import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import EngineRunsPage from "./EngineRunsPage";

const mocks = vi.hoisted(() => ({
  useEngineRun: vi.fn(),
  useEngineOverview: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  minimize: vi.fn(),
  restore: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
  getJobOpportunities: vi.fn(),
  deleteJob: vi.fn(),
}));

vi.mock("../state/engine-run-context", () => ({
  useEngineRun: mocks.useEngineRun,
}));

vi.mock("../hooks/useEngineOverview", () => ({
  useEngineOverview: mocks.useEngineOverview,
}));

vi.mock("../api/engineApi", () => ({
  engineApi: {
    getJobOpportunities: mocks.getJobOpportunities,
    deleteJob: mocks.deleteJob,
  },
}));

function runState(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      phase: "running",
      options: { allSources: true, maxPages: 3, incremental: true },
      startedAt: Date.now() - 12_000,
      completedAt: null,
      paused: false,
      reconnected: false,
      minimized: false,
      opportunities: [
        { title: "Award one", source: "One" },
        { title: "Award two", source: "Two" },
      ],
      skippedCount: 3,
      sourceProgress: [
        { name: "One", status: "completed" },
        { name: "Two", status: "running" },
      ],
      result: null,
      error: null,
      ...overrides,
    },
    start: vi.fn(),
    pause: mocks.pause,
    resume: mocks.resume,
    stop: mocks.stop,
    cancel: mocks.cancel,
    minimize: mocks.minimize,
    restore: mocks.restore,
    reset: mocks.reset,
  };
}

function overviewState(overrides: Record<string, unknown> = {}) {
  return {
    status: { status: "success", data: { success: true }, error: null },
    sources: { status: "success", data: [], error: null },
    stats: { status: "success", data: { total: 2, bySource: {} }, error: null },
    sites: { status: "success", data: [], error: null },
    jobs: {
      status: "success",
      data: [
        {
          id: "job-1",
          source_id: 1,
          source_name: "Source one",
          run_type: "manual",
          status: "failed",
          urls_discovered: 10,
          urls_scraped: 8,
          urls_saved: 4,
          urls_failed: 2,
          items_found: 6,
          source_results: null,
          errors: [{ message: "Provider rejected the page" }],
          warnings: ["Two rows were incomplete"],
          duration_seconds: 35,
          started_at: "2026-08-23T20:00:00.000Z",
          completed_at: "2026-08-23T20:00:35.000Z",
        },
      ],
      error: null,
    },
    refresh: mocks.refresh,
    ...overrides,
  };
}

describe("EngineRunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pause.mockResolvedValue(true);
    mocks.resume.mockResolvedValue(true);
    mocks.stop.mockResolvedValue(true);
    mocks.deleteJob.mockResolvedValue({ success: true });
    mocks.getJobOpportunities.mockResolvedValue([
      { title: "Recovered award", source: "Source one" },
    ]);
    mocks.useEngineRun.mockReturnValue(runState());
    mocks.useEngineOverview.mockReturnValue(overviewState());
  });

  it("shows active progress and controls the shared server run", async () => {
    const user = userEvent.setup();
    render(<EngineRunsPage />);

    expect(
      screen.getByRole("heading", { name: "Engine runs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 opportunities found")).toBeVisible();
    expect(screen.getByText("3 skipped as already known")).toBeVisible();
    expect(screen.getByText("1 of 2 sources complete")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Pause run" }));
    await user.click(screen.getByRole("button", { name: "Stop run" }));
    await user.click(screen.getByRole("button", { name: "Minimize run" }));

    expect(mocks.pause).toHaveBeenCalledTimes(1);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.minimize).toHaveBeenCalledTimes(1);
  });

  it("shows resume and restore actions for a minimized paused run", async () => {
    const user = userEvent.setup();
    mocks.useEngineRun.mockReturnValue(
      runState({ paused: true, minimized: true }),
    );
    render(<EngineRunsPage />);

    await user.click(screen.getByRole("button", { name: "Resume run" }));
    await user.click(screen.getByRole("button", { name: "Restore run" }));

    expect(mocks.resume).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });

  it("keeps run-history failure distinct from an empty history", () => {
    const error = new AdminApiError({
      message: "Run history unavailable. Reference jobs-503.",
      category: "http",
      status: 503,
      requestId: "jobs-503",
      targetOrigin: "https://edutu-api.onrender.com",
      elapsedMs: 30,
    });
    mocks.useEngineOverview.mockReturnValue(
      overviewState({
        jobs: { status: "error", data: null, error },
      }),
    );

    render(<EngineRunsPage />);

    expect(screen.getByText("Run history unavailable")).toBeVisible();
    expect(screen.getByText("jobs-503")).toBeVisible();
    expect(screen.queryByText("No runs yet")).not.toBeInTheDocument();
  });

  it("inspects job failures, warnings, and produced opportunities", async () => {
    const user = userEvent.setup();
    render(<EngineRunsPage />);

    await user.click(
      screen.getByRole("button", { name: "Inspect run job-1" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Run job-1 details",
    });
    expect(within(dialog).getByText("Provider rejected the page")).toBeVisible();
    expect(within(dialog).getByText("Two rows were incomplete")).toBeVisible();
    expect(within(dialog).getByText("Recovered award")).toBeVisible();
    expect(mocks.getJobOpportunities).toHaveBeenCalledWith("job-1");
  });

  it("deletes a job only after confirmation and refreshes history", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EngineRunsPage />);

    await user.click(screen.getByRole("button", { name: "Delete run job-1" }));

    await waitFor(() => expect(mocks.deleteJob).toHaveBeenCalledWith("job-1"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate Engine section navigation inside the page", () => {
    render(<EngineRunsPage />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Status" })).not.toBeInTheDocument();
  });
});
