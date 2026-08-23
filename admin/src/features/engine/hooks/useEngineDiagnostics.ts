import type { AdminRuntimeConfig } from "../../../lib/runtimeConfig";
import type { EngineStatus } from "../model/types";
import {
  idleResource,
  type EngineResourceState,
} from "../model/errors";

export interface ApiLivenessStatus {
  status: "ok";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: { process: { status: "up" } };
}

export interface ApiReadinessStatus {
  status: "ready" | "not_ready";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: Record<string, unknown>;
}

export type DiagnosticSeverity = "success" | "info" | "warning" | "error";

export interface EngineDiagnosticCheck {
  code: string;
  label: string;
  severity: DiagnosticSeverity;
  message: string;
  requestId?: string;
}

export interface EngineDiagnosticsState {
  runtimeConfig: AdminRuntimeConfig | null;
  runtimeConfigError: Error | null;
  liveness: EngineResourceState<ApiLivenessStatus>;
  readiness: EngineResourceState<ApiReadinessStatus>;
  engineStatus: EngineResourceState<EngineStatus>;
  checks: EngineDiagnosticCheck[];
  refresh(): Promise<void>;
}

// RED-phase scaffold: tests define health separation and drift rules.
export function useEngineDiagnostics(): EngineDiagnosticsState {
  return {
    runtimeConfig: null,
    runtimeConfigError: null,
    liveness: idleResource(),
    readiness: idleResource(),
    engineStatus: idleResource(),
    checks: [],
    refresh: async () => undefined,
  };
}
