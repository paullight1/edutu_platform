import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import EngineSourcesPage from "./EngineSourcesPage";

const mocks = vi.hoisted(() => ({
  useEngineOverview: vi.fn(),
  useEngineRun: vi.fn(),
  refresh: vi.fn(),
  start: vi.fn(),
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
    createSource: mocks.createSource,
    updateSource: mocks.updateSource,
    deleteSource: mocks.deleteSource,
    deleteSiteOpportunities: mocks.deleteSiteOpportunities,
  },
}));

function overviewState(overrides: Record<string, unknown> = {}) {
  return {
    status: { status: "success", data: { success: true }, error: null },
    sources: {
      status: "success",
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
          last_scraped: "2026-08-23T18:00:00.000Z",
          last_success: "2026-08-23T18:00:00.000Z",
          last_error: null,
          total_scraped: 12,
          total_failed: 1,
          parent_id: 10,
        },
        {
          id: 12,
          name: "Source two",
          url: "https://two.example.com",
          tier: 2,
          category: "fellowship",
          enabled: false,
          priority: 2,
          last_scraped: null,
          last_success: null,
          last_error: "Timed out",
          total_scraped: 3,
          total_failed: 2,
        },
      ],
      error: null,
    },
    jobs: {
      status: "success",
      data: [
        { id: "job-1", status: "completed" },
        { id: "job-2", status: "failed" },
      ],
      error: null,
    },
    stats: {
      status: "success",
      data: { total: 145, bySource: { "Source one": 120 } },
      error: null,
    },
    sites: {
      status: "success",
      data: [
        {
          host: "example.com",
          total: 24,
          batches: [
            {
              jobId: "job-1",
              count: 24,
              firstSeen: null,
              lastSeen: null,
              runType: "manual",
              startedAt: "2026-08-23T18:00:00.000Z",
            },
          ],
        },
      ],
      error: null,
    },
    refresh: mocks.refresh,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/engine"]}>
      <EngineSourcesPage />
    </MemoryRouter>,
  );
}

describe("EngineSourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
    mocks.start.mockResolvedValue(true);
    mocks.createSource.mockResolvedValue({ success: true, data: { id: 99 } });
    mocks.updateSource.mockResolvedValue({ success: true });
    mocks.deleteSource.mockResolvedValue({ success: true });
    mocks.deleteSiteOpportunities.mockResolvedValue({ success: true, deleted: 24 });
    mocks.useEngineOverview.mockReturnValue(overviewState());
    mocks.useEngineRun.mockReturnValue({
      state: { phase: "idle" },
      start: mocks.start,
    });
  });

  it("renders genuine metrics, groups, children, and disabled sources", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Engine sources" })).toBeVisible();
    expect(screen.getByText("145")).toBeVisible();
    expect(screen.getByText("1 active source")).toBeVisible();
    expect(screen.getByText("1 failed run")).toBeVisible();

    const group = screen.getByRole("region", { name: "Africa scholarships" });
    expect(within(group).getByText("Source one")).toBeVisible();
    expect(screen.getByText("Source two")).toBeVisible();
    expect(screen.getByText("Disabled")).toBeVisible();
  });

  it("does not replace failed statistics with zero", () => {
    const error = new AdminApiError({
      message: "Stats unavailable. Reference stats-503.",
      category: "http",
      status: 503,
      requestId: "stats-503",
      targetOrigin: "https://edutu-api.onrender.com",
      elapsedMs: 25,
    });
    mocks.useEngineOverview.mockReturnValue(
      overviewState({
        stats: { status: "error", data: null, error },
      }),
    );

    renderPage();

    expect(screen.getByText("Statistics unavailable")).toBeVisible();
    expect(screen.getByText("stats-503")).toBeVisible();
    expect(screen.queryByText("0 total opportunities")).not.toBeInTheDocument();
  });

  it("adds a single source and refreshes the inventory", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add source" }));
    const dialog = screen.getByRole("dialog", { name: "Add Engine source" });
    await user.type(within(dialog).getByLabelText("Source name"), "New source");
    await user.type(
      within(dialog).getByLabelText("Source URL"),
      "https://new.example.com",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Category"),
      "grant",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save source" }));

    await waitFor(() =>
      expect(mocks.createSource).toHaveBeenCalledWith({
        name: "New source",
        url: "https://new.example.com",
        category: "grant",
        tier: 2,
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("creates a source group and attaches every valid bulk URL", async () => {
    const user = userEvent.setup();
    mocks.createSource
      .mockResolvedValueOnce({ success: true, data: { id: 50 } })
      .mockResolvedValue({ success: true, data: { id: 51 } });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add source" }));
    const dialog = screen.getByRole("dialog", { name: "Add Engine source" });
    await user.click(within(dialog).getByLabelText("Source group"));
    await user.type(within(dialog).getByLabelText("Source name"), "Fellowships");
    await user.selectOptions(within(dialog).getByLabelText("Category"), "fellowship");
    await user.type(
      within(dialog).getByLabelText("Bulk sources"),
      "Alpha | https://alpha.example.com\nhttps://beta.example.com\ninvalid line",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(mocks.createSource).toHaveBeenCalledTimes(3));
    expect(mocks.createSource).toHaveBeenNthCalledWith(1, {
      name: "Fellowships",
      category: "fellowship",
      tier: 2,
      is_group: true,
    });
    expect(mocks.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alpha",
        url: "https://alpha.example.com",
        parent_id: 50,
      }),
    );
    expect(mocks.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "beta.example.com",
        url: "https://beta.example.com",
        parent_id: 50,
      }),
    );
  });

  it("toggles, runs, and deletes a source through the canonical APIs", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Disable Source one" }));
    expect(mocks.updateSource).toHaveBeenCalledWith(11, { enabled: false });

    await user.click(screen.getByRole("button", { name: "Run Source one" }));
    expect(mocks.start).toHaveBeenCalledWith({
      sourceId: 11,
      maxPages: 3,
      incremental: true,
    });

    await user.click(screen.getByRole("button", { name: "Delete Source one" }));
    expect(mocks.deleteSource).toHaveBeenCalledWith(11);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("starts all enabled sources and can remove every opportunity from a site", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Run all enabled sources" }),
    );
    expect(mocks.start).toHaveBeenCalledWith({
      allSources: true,
      maxPages: 3,
      incremental: true,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Delete all opportunities from example.com",
      }),
    );
    expect(mocks.deleteSiteOpportunities).toHaveBeenCalledWith("example.com");
  });

  it("filters sources without duplicating Engine navigation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Search sources"), "two");
    expect(screen.queryByText("Source one")).not.toBeInTheDocument();
    expect(screen.getByText("Source two")).toBeVisible();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Live Runs" })).not.toBeInTheDocument();
  });
});
