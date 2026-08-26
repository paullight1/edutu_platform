import type { EngineRunState, EngineSourceProgress } from "../model/run";
import type {
  EngineStreamEvent,
  OpenRunStreamOptions,
  RunStatus,
  ScrapeResult,
} from "../model/types";

export type EngineRunAction =
  | {
      type: "begin";
      options: OpenRunStreamOptions;
      startedAt: number;
    }
  | { type: "stream-event"; event: EngineStreamEvent }
  | { type: "complete"; result: ScrapeResult; completedAt: number }
  | {
      type: "fail";
      error: NonNullable<EngineRunState["error"]>;
      completedAt: number;
    }
  | { type: "set-paused"; paused: boolean }
  | { type: "set-stopping" }
  | { type: "reattach"; status: RunStatus; observedAt: number }
  | { type: "reattach-completed"; completedAt: number }
  | { type: "minimize" }
  | { type: "restore" }
  | { type: "reset" };

export function createInitialEngineRunState(): EngineRunState {
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
  };
}

export function isActiveRunPhase(phase: EngineRunState["phase"]): boolean {
  return phase === "starting" || phase === "running" || phase === "stopping";
}

function updateSourceProgress(
  progress: EngineSourceProgress[],
  name: string,
  status: EngineSourceProgress["status"],
): EngineSourceProgress[] {
  const index = progress.findIndex((entry) => entry.name === name);
  if (index < 0) return [...progress, { name, status }];

  return progress.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, status } : entry,
  );
}

function applyStreamEvent(
  state: EngineRunState,
  event: EngineStreamEvent,
): EngineRunState {
  switch (event.type) {
    case "start":
      return {
        ...state,
        phase: "running",
        sourceProgress: [...new Set(event.sources || [])].map((name) => ({
          name,
          status: "pending" as const,
        })),
      };
    case "source-start":
      return {
        ...state,
        phase: "running",
        sourceProgress: updateSourceProgress(
          state.sourceProgress,
          event.name,
          "running",
        ),
      };
    case "source-skip":
      return {
        ...state,
        skippedCount: state.skippedCount + Math.max(0, event.skipped || 0),
      };
    case "control":
      return {
        ...state,
        phase: event.state === "stopping" ? "stopping" : "running",
        paused: event.state === "paused",
      };
    case "opportunity":
      return {
        ...state,
        phase: "running",
        opportunities: [...state.opportunities, event.opportunity],
      };
    case "source-done":
      return {
        ...state,
        sourceProgress: updateSourceProgress(
          state.sourceProgress,
          event.name,
          event.error ? "failed" : "completed",
        ),
      };
    case "done":
    case "error":
      return state;
    default:
      return state;
  }
}

function completeProgress(
  progress: EngineSourceProgress[],
): EngineSourceProgress[] {
  return progress.map((entry) =>
    entry.status === "pending" || entry.status === "running"
      ? { ...entry, status: "completed" as const }
      : entry,
  );
}

export function engineRunReducer(
  state: EngineRunState,
  action: EngineRunAction,
): EngineRunState {
  switch (action.type) {
    case "begin":
      return {
        ...createInitialEngineRunState(),
        phase: "starting",
        options: action.options,
        startedAt: action.startedAt,
      };
    case "stream-event":
      return applyStreamEvent(state, action.event);
    case "complete":
      return {
        ...state,
        phase: "completed",
        paused: false,
        completedAt: action.completedAt,
        result: action.result,
        opportunities:
          state.opportunities.length > 0
            ? state.opportunities
            : action.result.opportunities || [],
        sourceProgress: completeProgress(state.sourceProgress),
      };
    case "fail":
      return {
        ...state,
        phase: "failed",
        paused: false,
        completedAt: action.completedAt,
        error: action.error,
      };
    case "set-paused":
      return {
        ...state,
        phase: "running",
        paused: action.paused,
      };
    case "set-stopping":
      return { ...state, phase: "stopping" };
    case "reattach":
      return {
        ...state,
        phase: action.status.stopping ? "stopping" : "running",
        paused: action.status.paused,
        reconnected: true,
        startedAt: state.startedAt || action.observedAt,
        completedAt: null,
        error: null,
      };
    case "reattach-completed":
      return {
        ...state,
        phase: "completed",
        paused: false,
        reconnected: true,
        completedAt: action.completedAt,
      };
    case "minimize":
      return { ...state, minimized: true };
    case "restore":
      return { ...state, minimized: false };
    case "reset":
      return createInitialEngineRunState();
    default:
      return state;
  }
}
