import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EngineSourcesPage from "./EngineSourcesPage";

const mocks = vi.hoisted(() => ({
  useEngineOverview: vi.fn(),
  useEngineRun: vi.fn(),
  refresh: vi.fn(),
  start: vi.fn(),
  deleteJob: vi.fn(),
  createSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  deleteSiteOpportunities: vi.fn(),
}));

vi.mock("../hooks/useEngineOverview", () => ({
  useEngineOverview: mocks.useEngineOverview,
}));

vi.mock("../state/engine-run-context", () => ({
  useEngineRun: mocks.useEngineRun,
}));

vi.mock("../api/engineApi", () => ({
  engineApi: {
    deleteJob: mocks.deleteJob,
    createSource: mocks.createSource,
    updateSource: mocks.updateSource,
    deleteSource: mocks.deleteSource,
    deleteSiteOpportunities: mocks.deleteSiteOpportunities,
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/engine"]}>
      <EngineSourcesPage />
    </MemoryRouter>,
  );
}

describe("EngineSourcesPage advanced operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
    mocks.start.mockResolvedValue(true);
    mocks.deleteJob.mockResolvedValue({ success: true });
    mocks.useEngineRun.mockReturnValue({
      state: { phase: "idle" },
      start: mocks.start,
    });
    mocks.useEngineOverview.mockReturnValue({
      status: { status: "success", data: { success: true }, error: null },
      jobs: { status: "success", data: [], error: null },
      stats: { status: "success", data: { total: 24, bySource: {} }, error: null },
      sources: {
        status: "success",
        error: null,
        data: [
          {
            id: 10,
            name: "Africa scholarships",
            url: "group://africa-scholarships",
            tier: 1,
            category: "scholarship",
            enabled: true,
            priority: 1,
            last_scraped: null,
            last_success: null,
            last_error: null,
            total_scraped: 0,
            total_failed: 0,
            is_group: true,
          },
          {
            id: 11,
            name: "Source one",
            url: "https://one.example.com",
            tier: 2,
            category: "scholarship",
            enabled: true,
            priority: 1,
            last_scraped: null,
            last_success: null,
            last_error: null,
            total_scraped: 12,
            total_failed: 0,
            parent_id: 10,
          },
          {
            id: 12,
            name: "Source disabled",
            url: "https://disabled.example.com",
            tier: 2,
            category: "scholarship",
            enabled: false,
            priority: 2,
            last_scraped: null,
            last_success: null,
            last_error: null,
            total_scraped: 0,
            total_failed: 0,
            parent_id: 10,
          },
        ],
      },
      sites: {
        status: "success",
        error: null,
        data: [
          {
            host: "example.com",
            total: 24,
            batches: [
              {
                jobId: "job-1",
                count: 15,
                firstSeen: null,
                lastSeen: null,
                runType: "manual",
                startedAt: "2026-08-23T18:00:00.000Z",
              },
              {
                jobId: "job-2",
                count: 9,
                firstSeen: null,
                lastSeen: null,
                runType: "scheduled",
                startedAt: "2026-08-22T18:00:00.000Z",
              },
            ],
          },
        ],
      },
      refresh: mocks.refresh,
    });
  });

  it("reviews enabled group members before running them sequentially", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: "Review run for Africa scholarships",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Review Africa scholarships run",
    });
    expect(within(dialog).getByText("Source one")).toBeVisible();
    expect(within(dialog).getByText("Source disabled")).toBeVisible();
    expect(within(dialog).getByText("Disabled sources will be skipped")).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", { name: "Start group run" }),
    );

    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({
        sourceId: 11,
        maxPages: 3,
        incremental: true,
      }),
    );
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("expands site batches and deletes one attributed batch after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "View batches for example.com" }),
    );
    expect(screen.getByText("15 opportunities")).toBeVisible();
    expect(screen.getByText("9 opportunities")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Delete batch job-1" }),
    );

    await waitFor(() => expect(mocks.deleteJob).toHaveBeenCalledWith("job-1"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
