import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EngineRunDock from "./EngineRunDock";

const mocks = vi.hoisted(() => ({
  useEngineRun: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("../state/engine-run-context", () => ({
  useEngineRun: mocks.useEngineRun,
}));

function runValue(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      phase: "running",
      options: { allSources: true, maxPages: 3, incremental: true },
      startedAt: Date.now() - 5_000,
      completedAt: null,
      paused: false,
      reconnected: false,
      minimized: true,
      opportunities: [{ title: "One", source: "One" }],
      skippedCount: 2,
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
    cancel: vi.fn(),
    minimize: vi.fn(),
    restore: mocks.restore,
    reset: vi.fn(),
  };
}

function renderDock(path = "/opportunities") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <EngineRunDock />
              <div data-testid="current-route">route</div>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EngineRunDock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pause.mockResolvedValue(true);
    mocks.resume.mockResolvedValue(true);
    mocks.stop.mockResolvedValue(true);
    mocks.useEngineRun.mockReturnValue(runValue());
  });

  it("keeps a minimized run visible outside the Engine section", () => {
    renderDock();

    const dock = screen.getByRole("region", { name: "Background Engine run" });
    expect(dock).toBeVisible();
    expect(screen.getByText("1 found")).toBeVisible();
    expect(screen.getByText("2 skipped")).toBeVisible();
    expect(screen.getByText("1/2 sources")).toBeVisible();
  });

  it("opens the runs route and restores the full run view", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(screen.getByRole("button", { name: "Open Engine run" }));
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });

  it("pauses, resumes, and stops the server run", async () => {
    const user = userEvent.setup();
    const view = renderDock();

    await user.click(screen.getByRole("button", { name: "Pause background run" }));
    await user.click(screen.getByRole("button", { name: "Stop background run" }));
    expect(mocks.pause).toHaveBeenCalledTimes(1);
    expect(mocks.stop).toHaveBeenCalledTimes(1);

    mocks.useEngineRun.mockReturnValue(runValue({ paused: true }));
    view.rerender(
      <MemoryRouter initialEntries={["/opportunities"]}>
        <EngineRunDock />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Resume background run" }));
    expect(mocks.resume).toHaveBeenCalledTimes(1);
  });

  it("stays hidden for an idle run", () => {
    mocks.useEngineRun.mockReturnValue(
      runValue({ phase: "idle", minimized: false, opportunities: [] }),
    );
    renderDock();
    expect(
      screen.queryByRole("region", { name: "Background Engine run" }),
    ).not.toBeInTheDocument();
  });
});
