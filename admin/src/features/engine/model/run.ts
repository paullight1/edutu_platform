import type {
  AdminApiError,
} from "../../../lib/apiError";
import type {
  OpenRunStreamOptions,
  ScrapeResult,
  ScrapedOpportunity,
} from "./types";

export type EngineRunPhase =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "failed";

export type EngineSourceProgressStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface EngineSourceProgress {
  name: string;
  status: EngineSourceProgressStatus;
}

export interface EngineRunState {
  phase: EngineRunPhase;
  options: OpenRunStreamOptions | null;
  startedAt: number | null;
  completedAt: number | null;
  paused: boolean;
  reconnected: boolean;
  minimized: boolean;
  opportunities: ScrapedOpportunity[];
  skippedCount: number;
  sourceProgress: EngineSourceProgress[];
  result: ScrapeResult | null;
  error: AdminApiError | null;
}

export const INITIAL_ENGINE_RUN_STATE: EngineRunState = {
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
