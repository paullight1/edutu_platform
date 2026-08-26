import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EngineRunProvider } from "./EngineRunProvider";
import { useEngineRun } from "./engine-run-context";
import type { EngineStreamHandlers, ScrapeResult } from "../model/types";

const api = vi.hoisted(() => ({
  getRunStatus: vi.fn(),
  openRunStream: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  stopRun: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

function wrapper({ children }: { children: ReactNode }) {
  return <EngineRunProvider>{children}</EngineRunProvider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("EngineRunProvider", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    api.getRunStatus.mockResolvedValue({
      running: false,
      paused: false,
      stopping: false,
    });
    api.pauseRun.mockResolvedValue(undefined);
    api.resumeRun.mockResolvedValue(undefined);
    api.stopRun.mockResolvedValue(undefined);
  });

  it("streams source progress and opportunities into one shared completed run", async () => {
    api.openRunStream.mockImplementation(
      async (
        _options: unknown,
        handlers: EngineStreamHandlers,
      ): Promise<ScrapeResult> => {
        handlers.onEvent?.({ type: "start", sources: ["One"] });
        handlers.onEvent?.({ type: "source-start", name: "One" });
        handlers.onEvent?.({
          type: "opportunity",
          opportunity: { title: "Award", source: "One" },
        });
        handlers.onEvent?.({ type: "source-skip", skipped: 2 });
        handlers.onEvent?.({ type: "source-done", name: "One" });
        return { success: true, totalResults: 1, itemsSkipped: 2 };
      },
    );

    const { result } = renderHook(() => useEngineRun(), { wrapper });
    let started = false;

    await act(async () => {
      started = await result.current.start({
        allSources: true,
        maxPages: 3,
        incremental: true,
      });
    });

    expect(started).toBe(true);
    expect(result.current.state).toMatchObject({
      phase: "completed",
      paused: false,
      reconnected: false,
      skippedCount: 2,
      result: { success: true, totalResults: 1 },
    });
    expect(result.current.state.opportunities).toEqual([
      { title: "Award", source: "One" },
    ]);
    expect(result.current.state.sourceProgress).toEqual([
      { name: "One", status: "completed" },
    ]);
  });

  it("prevents a duplicate run and keeps minimize state across routes", async () => {
    const stream = deferred<ScrapeResult>();
    api.openRunStream.mockReturnValue(stream.promise);
    const { result } = renderHook(() => useEngineRun(), { wrapper });

    let firstRun!: Promise<boolean>;
    act(() => {
      firstRun = result.current.start({
        sourceId: 7,
        maxPages: 2,
        incremental: false,
      });
    });

    await waitFor(() => expect(result.current.state.phase).toBe("starting"));

    let duplicateStarted = true;
    await act(async () => {
      duplicateStarted = await result.current.start({
        allSources: true,
        maxPages: 3,
        incremental: true,
      });
    });
    expect(duplicateStarted).toBe(false);
    expect(api.openRunStream).toHaveBeenCalledTimes(1);

    act(() => result.current.minimize());
    expect(result.current.state.minimized).toBe(true);
    act(() => result.current.restore());
    expect(result.current.state.minimized).toBe(false);

    stream.resolve({ success: true, totalResults: 0 });
    await act(async () => {
      await firstRun;
    });
  });

  it("controls the active server run through pause, resume, and graceful stop", async () => {
    const stream = deferred<ScrapeResult>();
    api.openRunStream.mockReturnValue(stream.promise);
    const { result } = renderHook(() => useEngineRun(), { wrapper });

    let activeRun!: Promise<boolean>;
    act(() => {
      activeRun = result.current.start({
        allSources: true,
        maxPages: 3,
        incremental: true,
      });
    });
    await waitFor(() => expect(result.current.state.phase).toBe("starting"));

    await act(async () => {
      expect(await result.current.pause()).toBe(true);
    });
    expect(result.current.state.paused).toBe(true);

    await act(async () => {
      expect(await result.current.resume()).toBe(true);
    });
    expect(result.current.state.paused).toBe(false);

    await act(async () => {
      expect(await result.current.stop()).toBe(true);
    });
    expect(result.current.state.phase).toBe("stopping");
    expect(api.pauseRun).toHaveBeenCalledTimes(1);
    expect(api.resumeRun).toHaveBeenCalledTimes(1);
    expect(api.stopRun).toHaveBeenCalledTimes(1);

    stream.resolve({ success: true, totalResults: 0 });
    await act(async () => {
      await activeRun;
    });
  });

  it("reattaches to a server-side run after refresh and detects completion", async () => {
    vi.useFakeTimers();
    api.getRunStatus
      .mockResolvedValueOnce({ running: true, paused: true, stopping: false })
      .mockResolvedValueOnce({ running: false, paused: false, stopping: false });

    const { result } = renderHook(() => useEngineRun(), { wrapper });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toMatchObject({
      phase: "running",
      paused: true,
      reconnected: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.state).toMatchObject({
      phase: "completed",
      paused: false,
      reconnected: true,
    });
  });

  it("does not open a second stream when the server already owns a run", async () => {
    api.getRunStatus.mockResolvedValue({
      running: true,
      paused: false,
      stopping: false,
    });
    const { result } = renderHook(() => useEngineRun(), { wrapper });

    let started = true;
    await act(async () => {
      started = await result.current.start({
        sourceId: 4,
        maxPages: 2,
        incremental: true,
      });
    });

    expect(started).toBe(false);
    expect(api.openRunStream).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      phase: "running",
      reconnected: true,
    });
  });
});
