import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeSource } from "../model/types";
import EngineSourcesPage from "./EngineSourcesPage";

const mocks = vi.hoisted(() => ({
  useEngineSources: vi.fn(),
  refresh: vi.fn(),
  createSource: vi.fn(),
  addBulkSources: vi.fn(),
  setSourceEnabled: vi.fn(),
  deleteSource: vi.fn(),
  deleteSite: vi.fn(),
  deleteBatch: vi.fn(),
  startRun: vi.fn(),
}));

vi.mock("../hooks/useEngineSources", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../hooks/useEngineSources")
  >();
  return {
    ...actual,
    useEngineSources: mocks.useEngineSources,
  };
});

function source(overrides: Partial<ScrapeSource> = {}): ScrapeSource {
  return {
    id: 1,
    name: "Opportunity Desk",
    url: "https://example.com/opportunities",
    tier: 1,
    category: "scholarship",
    enabled: true,
    priority: 1,
    last_scraped: null,
    last_success: null,
    last_error: null,
    total_scraped: 0,
    total_failed: 0,
    parent_id: null,
    is_group: false,
    ...overrides,
  };
}

function state(sources: ScrapeSource[] = []) {
  return {
    sources: { status: "success", data: sources, error: null },
    sites: { status: "success", data: [], error: null },
    stats: {
      status: "success",
      data: { total: 0, bySource: {} },
      error: null,
    },
    refresh: mocks.refresh,
    createSource: mocks.createSource,
    addBulkSources: mocks.addBulkSources,
    setSourceEnabled: mocks.setSourceEnabled,
    deleteSource: mocks.deleteSource,
    deleteSite: mocks.deleteSite,
    deleteBatch: mocks.deleteBatch,
    startRun: mocks.startRun,
    pendingOperations: new Set<string>(),
  };
}

describe("EngineSourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEngineSources.mockReturnValue(state());
    mocks.deleteSource.mockResolvedValue({ success: true });
    mocks.startRun.mockResolvedValue({ success: true, totalResults: 0 });
  });

  it("renders an unavailable state instead of a false empty inventory", () => {
    mocks.useEngineSources.mockReturnValue({
      ...state(),
      sources: {
        status: "error",
        data: null,
        error: new Error("offline"),
      },
    });

    render(<EngineSourcesPage />);

    expect(screen.getByText("Sources unavailable")).toBeVisible();
    expect(screen.queryByText("No sources configured")).not.toBeInTheDocument();
  });

  it("renders a truthful empty state after a successful empty response", () => {
    render(<EngineSourcesPage />);

    expect(
      screen.getByRole("heading", { name: "Engine sources" }),
    ).toBeVisible();
    expect(screen.getByText("No sources configured")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add source" }),
    ).toBeEnabled();
  });

  it("prevents a disabled source from starting a run", () => {
    mocks.useEngineSources.mockReturnValue(
      state([source({ id: 7, name: "Disabled source", enabled: false })]),
    );

    render(<EngineSourcesPage />);

    expect(
      screen.getByRole("button", { name: "Run Disabled source" }),
    ).toBeDisabled();
  });

  it("requires confirmation before deleting a source", async () => {
    const user = userEvent.setup();
    const current = source({ id: 8, name: "Disposable source" });
    mocks.useEngineSources.mockReturnValue(state([current]));

    render(<EngineSourcesPage />);

    await user.click(
      screen.getByRole("button", { name: "Delete Disposable source" }),
    );
    expect(mocks.deleteSource).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete source?")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Delete source" }),
    );

    expect(mocks.deleteSource).toHaveBeenCalledWith(current);
  });

  it("reviews only a group's children and keeps max pages editable before running", async () => {
    const user = userEvent.setup();
    const group = source({
      id: 20,
      name: "African scholarship sources",
      url: "",
      is_group: true,
    });
    const childOne = source({
      id: 21,
      name: "Child one",
      parent_id: 20,
    });
    const childTwo = source({
      id: 22,
      name: "Child two",
      parent_id: 20,
    });
    const unrelated = source({ id: 30, name: "Unrelated source" });
    mocks.useEngineSources.mockReturnValue(
      state([group, childOne, childTwo, unrelated]),
    );

    render(<EngineSourcesPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Review group run African scholarship sources",
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "Review group run" });
    expect(within(dialog).getByText("Child one")).toBeVisible();
    expect(within(dialog).getByText("Child two")).toBeVisible();
    expect(within(dialog).queryByText("Unrelated source")).not.toBeInTheDocument();

    const maxPages = within(dialog).getByRole("spinbutton", {
      name: "Maximum pages per source",
    });
    await user.clear(maxPages);
    await user.type(maxPages, "4");
    await user.click(
      within(dialog).getByRole("button", { name: "Start group run" }),
    );

    expect(mocks.startRun).toHaveBeenCalledWith(group, {
      maxPages: 4,
      incremental: true,
    });
  });
});
