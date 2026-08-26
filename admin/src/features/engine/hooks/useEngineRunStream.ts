import { useEngineRun } from "../state/engine-run-context";

/**
 * Presentation-facing alias for the single global Engine run context. Keeping
 * this hook deliberately thin prevents a second SSE connection or competing
 * lifecycle state from being introduced by the Runs workspace.
 */
export function useEngineRunStream() {
  return useEngineRun();
}
