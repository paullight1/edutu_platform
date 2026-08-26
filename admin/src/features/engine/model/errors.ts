import { AdminApiError } from "../../../lib/apiError";

export type EngineResourcePhase =
  | "idle"
  | "loading"
  | "success"
  | "error";

export interface EngineResourceState<T> {
  status: EngineResourcePhase;
  data: T | null;
  error: AdminApiError | null;
}

export function idleResource<T>(): EngineResourceState<T> {
  return { status: "idle", data: null, error: null };
}

export function loadingResource<T>(
  previous: EngineResourceState<T>,
): EngineResourceState<T> {
  return { status: "loading", data: previous.data, error: null };
}

export function successResource<T>(data: T): EngineResourceState<T> {
  return { status: "success", data, error: null };
}

function createFallbackRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `engine-error-${Date.now().toString(36)}`;
}

export function normalizeEngineError(
  error: unknown,
  message: string,
): AdminApiError {
  if (error instanceof AdminApiError) return error;

  return new AdminApiError({
    message,
    category: "network",
    requestId: createFallbackRequestId(),
    targetOrigin: "unknown",
    elapsedMs: 0,
  });
}

export function errorResource<T>(
  error: unknown,
  message: string,
  previousData: T | null = null,
): EngineResourceState<T> {
  return {
    status: "error",
    data: previousData,
    error: normalizeEngineError(error, message),
  };
}
