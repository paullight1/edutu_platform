import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineRunState } from "../model/run";
import BackgroundRunIndicator from "./BackgroundRunIndicator";

const mocks = vi.hoisted(() => ({
  useEngineRunStream: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("../hooks/useEngineRunStream", () => ({
  useEngineRunStream: mocks.useEngineRunStream,
}));

function state(overrides: Partial<EngineRunState> = {}): EngineRunState {
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

describe("BackgroundRunIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays hidden when there is no minimized run", () => {
    mocks.useEngineRunStream.mockReturnValue({
      state: state(),
      restore: mocks.restore,
    });

    render(<BackgroundRunIndicator />);

    expect(
      screen.queryByRole("button", { name: "Restore Engine run" }),
    ).not.toBeInTheDocument();
  });

  it("persists a minimized active run above route boundaries and restores it", async () => {
    const user = userEvent.setup();
    mocks.useEngineRunStream.mockReturnValue({
      state: state({
        phase: "running",
        minimized: true,
        paused: true,
        opportunities: [
          {
            title: "Award",
            source: "Opportunity Desk",
          },
        ],
      }),
      restore: mocks.restore,
    });

    render(<BackgroundRunIndicator />);

    expect(screen.getByText("Engine run paused in background")).toBeVisible();
    expect(screen.getByText("1 opportunity found")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Restore Engine run" }),
    );
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });
});
