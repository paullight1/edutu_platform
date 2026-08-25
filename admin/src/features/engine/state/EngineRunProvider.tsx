import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { engineApi } from "../api/engineApi";
import { normalizeEngineError } from "../model/errors";
import type { EngineRunState } from "../model/run";
import type { OpenRunStreamOptions, RunStatus } from "../model/types";
import {
  createInitialEngineRunState,
  engineRunReducer,
  isActiveRunPhase,
  type EngineRunAction,
} from "./engineRunReducer";
import {
  EngineRunContext,
  type EngineRunContextValue,
} from "./engine-run-context";

const REATTACH_POLL_MS = 5_000;

export interface EngineRunProviderProps {
  children: ReactNode;
  probeOnMount?: boolean;
}

export function EngineRunProvider({
  children,
  probeOnMount = true,
}: EngineRunProviderProps) {
  const [state, setState] = useState<EngineRunState>(
    createInitialEngineRunState,
  );
  const stateRef = useRef(state);
  const activeRef = useRef(false);
  const streamControllerRef = useRef<AbortController | null>(null);
  const bootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);

  const dispatch = useCallback((action: EngineRunAction) => {
    setState((current) => {
      const next = engineRunReducer(current, action);
      stateRef.current = next;
      return next;
    });
  }, []);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      globalThis.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollInFlightRef.current = false;
  }, []);

  const completeReattachedRun = useCallback(() => {
    activeRef.current = false;
    clearPolling();
    dispatch({ type: "reattach-completed", completedAt: Date.now() });
  }, [clearPolling, dispatch]);

  const applyServerStatus = useCallback(
    (status: RunStatus) => {
      if (!status.running) {
        completeReattachedRun();
        return;
      }

      activeRef.current = true;
      dispatch({ type: "reattach", status, observedAt: Date.now() });
    },
    [completeReattachedRun, dispatch],
  );

  const pollServerStatus = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const status = await engineApi.getRunStatus();
      applyServerStatus(status);
    } catch {
      // Preserve the known server-side run through transient poll failures.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [applyServerStatus]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current !== null) return;
    pollTimerRef.current = globalThis.setInterval(() => {
      void pollServerStatus();
    }, REATTACH_POLL_MS);
  }, [pollServerStatus]);

  useEffect(() => {
    if (!probeOnMount) return undefined;

    let disposed = false;
    bootstrapTimerRef.current = globalThis.setTimeout(() => {
      void engineApi
        .getRunStatus()
        .then((status) => {
          if (disposed || activeRef.current || !status.running) return;
          applyServerStatus(status);
          startPolling();
        })
        .catch(() => undefined);
    }, 0);

    return () => {
      disposed = true;
      if (bootstrapTimerRef.current !== null) {
        globalThis.clearTimeout(bootstrapTimerRef.current);
        bootstrapTimerRef.current = null;
      }
      clearPolling();
      streamControllerRef.current?.abort();
      streamControllerRef.current = null;
      activeRef.current = false;
    };
  }, [applyServerStatus, clearPolling, probeOnMount, startPolling]);

  const start = useCallback(
    async (options: OpenRunStreamOptions): Promise<boolean> => {
      if (activeRef.current || isActiveRunPhase(stateRef.current.phase)) {
        return false;
      }

      activeRef.current = true;
      clearPolling();
      const controller = new AbortController();
      streamControllerRef.current = controller;
      dispatch({ type: "begin", options, startedAt: Date.now() });

      try {
        try {
          const serverStatus = await engineApi.getRunStatus();
          if (serverStatus.running) {
            applyServerStatus(serverStatus);
            startPolling();
            return false;
          }
        } catch {
          // The run endpoint still enforces the single-run server boundary.
        }

        const result = await engineApi.openRunStream(
          options,
          {
            onEvent: (event) => dispatch({ type: "stream-event", event }),
          },
          controller.signal,
        );

        dispatch({ type: "complete", result, completedAt: Date.now() });
        return true;
      } catch (error) {
        if (controller.signal.aborted) {
          dispatch({ type: "reset" });
          return false;
        }

        dispatch({
          type: "fail",
          error: normalizeEngineError(error, "The Engine run failed."),
          completedAt: Date.now(),
        });
        return false;
      } finally {
        if (streamControllerRef.current === controller) {
          streamControllerRef.current = null;
        }
        if (!stateRef.current.reconnected) {
          activeRef.current = false;
        }
      }
    },
    [applyServerStatus, clearPolling, dispatch, startPolling],
  );

  const pause = useCallback(async (): Promise<boolean> => {
    if (!isActiveRunPhase(stateRef.current.phase)) return false;
    try {
      await engineApi.pauseRun();
      dispatch({ type: "set-paused", paused: true });
      return true;
    } catch {
      return false;
    }
  }, [dispatch]);

  const resume = useCallback(async (): Promise<boolean> => {
    if (!isActiveRunPhase(stateRef.current.phase)) return false;
    try {
      await engineApi.resumeRun();
      dispatch({ type: "set-paused", paused: false });
      return true;
    } catch {
      return false;
    }
  }, [dispatch]);

  const stop = useCallback(async (): Promise<boolean> => {
    if (!isActiveRunPhase(stateRef.current.phase)) return false;
    try {
      await engineApi.stopRun();
      dispatch({ type: "set-stopping" });
      return true;
    } catch {
      return false;
    }
  }, [dispatch]);

  const cancel = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    activeRef.current = false;
    clearPolling();
    dispatch({ type: "reset" });
  }, [clearPolling, dispatch]);

  const minimize = useCallback(() => dispatch({ type: "minimize" }), [dispatch]);
  const restore = useCallback(() => dispatch({ type: "restore" }), [dispatch]);

  const reset = useCallback(() => {
    if (isActiveRunPhase(stateRef.current.phase)) return;
    dispatch({ type: "reset" });
  }, [dispatch]);

  const value = useMemo<EngineRunContextValue>(
    () => ({
      state,
      start,
      pause,
      resume,
      stop,
      cancel,
      minimize,
      restore,
      reset,
    }),
    [cancel, minimize, pause, reset, restore, resume, start, state, stop],
  );

  return (
    <EngineRunContext.Provider value={value}>
      {children}
    </EngineRunContext.Provider>
  );
}
