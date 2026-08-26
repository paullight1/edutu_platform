import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineRunState } from "../model/run";
import type { ScrapeJob, ScrapedOpportunity } from "../model/types";
import EngineRunsPage from "./EngineRunsPage";

const mocks = vi.hoisted(() => ({
  useEngineRunStream: vi.fn(),
  useEngineRuns: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  minimize: vi.fn(),
  restore: vi.fn(),
  reset: vi.fn(),
  refreshJobs: vi.fn(),
  inspectJob: vi.fn(),
  closeInspection: vi.fn(),
  deleteJob: vi.fn(),
  toggleSelected: vi.fn(),
  selectAll: vi.fn(),
  improveSelected: vi.fn(),
  saveSelected: vi.fn(),
}));

vi.mock("../hooks/useEngineRunStream", () => ({
  useEngineRunStream: mocks.useEngineRunStream,
}));
vi.mock("../hooks/useEngineRuns", () => ({
  useEngineRuns: mocks.useEngineRuns,
}));

function runState(overrides: Partial<EngineRunState> = {}): EngineRunState {
  return {
    phase: "idle",
    options: null,
    startedAt: null,
    completedAt: null,
    paused: false,
    reconnected: false,
    minimized: false,
    opportunities: [],
    skippedCount: 0,
    sourceProgress: [],
    result: null,
    error: null,
    ...overrides,
  };
}

function job(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
  return {
    id: "job-1",
    source_id: 4,
    source_name: "Opportunity Desk",
    run_type: "manual",
    status: "completed",
    urls_discovered: 3,
    urls_scraped: 3,
    urls_saved: 2,
    urls_failed: 0,
    items_found: 2,
    source_results: null,
    errors: [],
    warnings: [],
    duration_seconds: 12,
    started_at: "2026-08-24T09:00:00.000Z",
    completed_at: "2026-08-24T09:00:12.000Z",
    ...overrides,
  };
}

function opportunity(overrides: Partial<ScrapedOpportunity> = {}): ScrapedOpportunity {
  return {
    id: "opp-1",
    title: "Opportunity one",
    source: "Opportunity Desk",
    sourceUrl: "https://example.org/opportunity",
    applyUrl: "https://example.org/apply",
    description: "Original description",
    category: "scholarship",
    ...overrides,
  };
}

function runsState(overrides: Record<string, unknown> = {}) {
  return {
    jobs: { status: "success", data: [], error: null },
    selectedJob: null,
    opportunities: { status: "idle", data: null, error: null },
    pendingOperations: new Set<string>(),
    refreshJobs: mocks.refreshJobs,
    inspectJob: mocks.inspectJob,
    closeInspection: mocks.closeInspection,
    deleteJob: mocks.deleteJob,
    toggleSelected: mocks.toggleSelected,
    selectAll: mocks.selectAll,
    improveSelected: mocks.improveSelected,
    saveSelected: mocks.saveSelected,
    ...overrides,
  };
}

describe("EngineRunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEngineRunStream.mockReturnValue({
      state: runState(),
      start: vi.fn(),
      pause: mocks.pause,
      resume: mocks.resume,
      stop: mocks.stop,
      cancel: vi.fn(),
      minimize: mocks.minimize,
      restore: mocks.restore,
      reset: mocks.reset,
    });
    mocks.useEngineRuns.mockReturnValue(runsState());
  });

  it("renders unavailable history instead of a false empty state", () => {
    mocks.useEngineRuns.mockReturnValue(
      runsState({
        jobs: {
          status: "error",
          data: null,
          error: new Error("history offline"),
        },
      }),
    );

    render(<EngineRunsPage />);

    expect(screen.getByText("Run history unavailable")).toBeVisible();
    expect(screen.queryByText("No Engine runs yet")).not.toBeInTheDocument();
  });

  it("shows the truthful empty state after a successful empty history response", () => {
    render(<EngineRunsPage />);

    expect(screen.getByRole("heading", { name: "Engine runs" })).toBeVisible();
    expect(screen.getByText("No Engine runs yet")).toBeVisible();
  });

  it("exposes pause, stop and minimize controls for one active run", async () => {
    const user = userEvent.setup();
    mocks.useEngineRunStream.mockReturnValue({
      state: runState({
        phase: "running",
        startedAt: Date.now() - 5_000,
        opportunities: [opportunity()],
        sourceProgress: [{ name: "Opportunity Desk", status: "running" }],
      }),
      start: vi.fn(),
      pause: mocks.pause,
      resume: mocks.resume,
      stop: mocks.stop,
      cancel: vi.fn(),
      minimize: mocks.minimize,
      restore: mocks.restore,
      reset: mocks.reset,
    });
    mocks.pause.mockResolvedValue(true);
    mocks.stop.mockResolvedValue(true);

    render(<EngineRunsPage />);

    await user.click(screen.getByRole("button", { name: "Pause run" }));
    await user.click(screen.getByRole("button", { name: "Stop run" }));
    await user.click(screen.getByRole("button", { name: "Minimize run" }));

    expect(mocks.pause).toHaveBeenCalledTimes(1);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.minimize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 opportunity found")).toBeVisible();
  });

  it("opens one historical job for diagnostics and opportunity review", async () => {
    const user = userEvent.setup();
    const currentJob = job({
      errors: [{ message: "source timed out" }],
      warnings: ["review deadline confidence"],
    });
    const reviewed = {
      original: opportunity(),
      current: opportunity({
        title: "Opportunity one improved",
        description: "Improved description",
      }),
      selected: true,
      improving: false,
      error: null,
    };
    mocks.useEngineRuns.mockReturnValue(
      runsState({
        jobs: { status: "success", data: [currentJob], error: null },
        selectedJob: currentJob,
        opportunities: { status: "success", data: [reviewed], error: null },
      }),
    );

    render(<EngineRunsPage />);

    await user.click(screen.getByRole("button", { name: "Inspect run job-1" }));
    expect(mocks.inspectJob).toHaveBeenCalledWith(currentJob);

    const dialog = screen.getByRole("dialog", { name: "Job details" });
    expect(within(dialog).getByText("source timed out")).toBeVisible();
    expect(within(dialog).getByText("review deadline confidence")).toBeVisible();
    expect(within(dialog).getByText("Original description")).toBeVisible();
    expect(within(dialog).getByText("Improved description")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Improve selected" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole("button", { name: "Save selected" }),
    ).toBeEnabled();
  });
});
