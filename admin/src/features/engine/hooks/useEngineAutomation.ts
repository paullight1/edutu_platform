import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminApiError } from "../../../lib/apiError";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  normalizeEngineError,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type { AutomationSettings } from "../model/types";

export interface PurgeExpiredOutcome {
  deletedCount: number;
}

export interface EngineAutomationState {
  settings: EngineResourceState<AutomationSettings>;
  mutationError: AdminApiError | null;
  pendingOperations: ReadonlySet<string>;
  refresh(): Promise<void>;
  saveSettings(settings: AutomationSettings): Promise<void>;
  purgeExpired(olderThanDays: number): Promise<PurgeExpiredOutcome>;
}

export function useEngineAutomation(): EngineAutomationState {
  const [settings, setSettings] = useState<EngineResourceState<AutomationSettings>>(
    idleResource,
  );
  const [mutationError, setMutationError] = useState<AdminApiError | null>(null);
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(
    () => new Set(),
  );
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setSettings((previous) => loadingResource(previous));

    try {
      const nextSettings = await engineApi.getAutomationSettings();
      if (version === requestVersion.current) {
        setSettings(successResource(nextSettings));
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setSettings((previous) =>
          errorResource(
            error,
            "Engine automation settings are unavailable.",
            previous.data,
          ),
        );
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    globalThis.queueMicrotask(() => {
      if (active) void refresh();
    });

    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [refresh]);

  const withPending = useCallback(
    async <T,>(operationId: string, operation: () => Promise<T>): Promise<T> => {
      setPendingOperations((current) => new Set(current).add(operationId));
      try {
        return await operation();
      } finally {
        setPendingOperations((current) => {
          const next = new Set(current);
          next.delete(operationId);
          return next;
        });
      }
    },
    [],
  );

  const saveSettings = useCallback(
    async (nextSettings: AutomationSettings): Promise<void> => {
      setMutationError(null);

      try {
        await withPending("save-settings", async () => {
          const result = await engineApi.updateAutomationSettings(nextSettings);
          if (!result.success) {
            throw new Error(result.error || "Settings update failed");
          }
          setSettings(successResource(nextSettings));
        });
      } catch (error) {
        const normalized = normalizeEngineError(
          error,
          "Engine automation settings could not be saved.",
        );
        setMutationError(normalized);
        throw normalized;
      }
    },
    [withPending],
  );

  const purgeExpired = useCallback(
    async (olderThanDays: number): Promise<PurgeExpiredOutcome> => {
      if (
        !Number.isInteger(olderThanDays) ||
        olderThanDays < 1 ||
        olderThanDays > 3_650
      ) {
        throw new Error("Retention days must be a whole number from 1 to 3650.");
      }

      setMutationError(null);
      try {
        return await withPending("purge-opportunities", async () => {
          const result = await engineApi.purgeOpportunities(olderThanDays);
          if (!result.success) {
            throw new Error("The purge operation was not accepted by the API.");
          }
          return { deletedCount: result.deletedCount };
        });
      } catch (error) {
        const normalized = normalizeEngineError(
          error,
          "Expired opportunities could not be purged.",
        );
        setMutationError(normalized);
        throw normalized;
      }
    },
    [withPending],
  );

  return {
    settings,
    mutationError,
    pendingOperations,
    refresh,
    saveSettings,
    purgeExpired,
  };
}
