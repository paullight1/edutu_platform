import { useMemo, type ReactNode } from "react";
import { INITIAL_ENGINE_RUN_STATE } from "../model/run";
import {
  EngineRunContext,
  type EngineRunContextValue,
} from "./engine-run-context";

export function EngineRunProvider({ children }: { children: ReactNode }) {
  const value = useMemo<EngineRunContextValue>(
    () => ({
      state: INITIAL_ENGINE_RUN_STATE,
      start: async () => false,
      pause: async () => false,
      resume: async () => false,
      stop: async () => false,
      cancel: () => undefined,
      minimize: () => undefined,
      restore: () => undefined,
      reset: () => undefined,
    }),
    [],
  );

  return (
    <EngineRunContext.Provider value={value}>
      {children}
    </EngineRunContext.Provider>
  );
}
