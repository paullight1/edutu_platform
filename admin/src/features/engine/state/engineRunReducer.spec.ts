import { describe, expect, it } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import {
  createInitialEngineRunState,
  engineRunReducer,
  isActiveRunPhase,
} from "./engineRunReducer";

describe("engineRunReducer", () => {
  it("moves one run from start events to a truthful completed result", () => {
    let state = engineRunReducer(createInitialEngineRunState(), {
      type: "begin",
      options: { allSources: true, maxPages: 3, incremental: true },
      startedAt: 100,
    });
    state = engineRunReducer(state, {
      type: "stream-event",
      event: { type: "start", sources: ["One", "One", "Two"] },
    });
    state = engineRunReducer(state, {
      type: "stream-event",
      event: { type: "source-start", name: "One" },
    });
    state = engineRunReducer(state, {
      type: "stream-event",
      event: {
        type: "opportunity",
        opportunity: { title: "Award", source: "One" },
      },
    });
    state = engineRunReducer(state, {
      type: "stream-event",
      event: { type: "source-done", name: "One" },
    });
    state = engineRunReducer(state, {
      type: "complete",
      result: { success: true, totalResults: 1 },
      completedAt: 200,
    });

    expect(state).toMatchObject({
      phase: "completed",
      startedAt: 100,
      completedAt: 200,
      opportunities: [{ title: "Award", source: "One" }],
      sourceProgress: [
        { name: "One", status: "completed" },
        { name: "Two", status: "completed" },
      ],
    });
  });

  it("keeps reattached server state distinct from a locally started run", () => {
    const state = engineRunReducer(createInitialEngineRunState(), {
      type: "reattach",
      status: { running: true, paused: true, stopping: false },
      observedAt: 300,
    });

    expect(state).toMatchObject({
      phase: "running",
      paused: true,
      reconnected: true,
      startedAt: 300,
    });
  });

  it("records a normalized failure without erasing collected evidence", () => {
    const error = new AdminApiError({
      message: "Run failed. Reference run-500.",
      category: "http",
      status: 500,
      requestId: "run-500",
      targetOrigin: "https://api.example.com",
      elapsedMs: 25,
    });
    const running = {
      ...createInitialEngineRunState(),
      phase: "running" as const,
      opportunities: [{ title: "Recovered item", source: "One" }],
    };

    const failed = engineRunReducer(running, {
      type: "fail",
      error,
      completedAt: 400,
    });

    expect(failed.phase).toBe("failed");
    expect(failed.error?.requestId).toBe("run-500");
    expect(failed.opportunities).toHaveLength(1);
  });

  it("identifies only server-active phases as active", () => {
    expect(isActiveRunPhase("starting")).toBe(true);
    expect(isActiveRunPhase("running")).toBe(true);
    expect(isActiveRunPhase("stopping")).toBe(true);
    expect(isActiveRunPhase("completed")).toBe(false);
    expect(isActiveRunPhase("failed")).toBe(false);
  });
});
