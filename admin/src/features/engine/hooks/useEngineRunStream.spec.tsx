import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EngineRunContext, type EngineRunContextValue } from "../state/engine-run-context";
import { createInitialEngineRunState } from "../state/engineRunReducer";
import { useEngineRunStream } from "./useEngineRunStream";

const value: EngineRunContextValue = {
  state: createInitialEngineRunState(),
  start: async () => true,
  pause: async () => true,
  resume: async () => true,
  stop: async () => true,
  cancel: () => undefined,
  minimize: () => undefined,
  restore: () => undefined,
  reset: () => undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <EngineRunContext.Provider value={value}>
      {children}
    </EngineRunContext.Provider>
  );
}

describe("useEngineRunStream", () => {
  it("reuses the single global Engine run context instead of creating a second lifecycle", () => {
    const { result } = renderHook(() => useEngineRunStream(), { wrapper });

    expect(result.current).toBe(value);
  });
});
