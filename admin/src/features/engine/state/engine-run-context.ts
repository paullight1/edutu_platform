import { createContext, useContext } from "react";
import type { OpenRunStreamOptions } from "../model/types";
import type { EngineRunState } from "../model/run";

export interface EngineRunContextValue {
  state: EngineRunState;
  start(options: OpenRunStreamOptions): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  stop(): Promise<boolean>;
  cancel(): void;
  minimize(): void;
  restore(): void;
  reset(): void;
}

export const EngineRunContext = createContext<EngineRunContextValue | null>(null);

export function useEngineRun(): EngineRunContextValue {
  const context = useContext(EngineRunContext);
  if (!context) {
    throw new Error("useEngineRun must be used inside EngineRunProvider");
  }
  return context;
}
