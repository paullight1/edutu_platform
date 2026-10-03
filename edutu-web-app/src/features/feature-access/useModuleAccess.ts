import { useCallback, useEffect, useRef, useState } from "react";
import { useProductSession } from "../workspace/shared";

export type ModuleAccess = "free" | "pro" | "disabled";
const MODULE_ACCESS_REFRESH_MS = 30_000;

interface MobileControlResponse {
  moduleLocks?: Record<string, ModuleAccess>;
}

/** Reads the same server-controlled module locks that the mobile app uses. */
export function useModuleAccess(moduleKey?: string) {
  const { request } = useProductSession();
  const [moduleLocks, setModuleLocks] = useState<Record<string, ModuleAccess>>(
    {},
  );
  const [loading, setLoading] = useState(Boolean(moduleKey));
  const hasLoaded = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async () => {
      if (!moduleKey) {
        setLoading(false);
        return;
      }

      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      if (!hasLoaded.current) setLoading(true);
      try {
        const config = await request<MobileControlResponse>(
          "/mobile-control/module-access",
          { cache: "no-store", signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setModuleLocks(config.moduleLocks ?? {});
          hasLoaded.current = true;
        }
      } catch {
        // Mobile control is intentionally fail-open if config is unavailable.
        if (!controller.signal.aborted) {
          setModuleLocks({});
          hasLoaded.current = true;
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    },
    [moduleKey, request],
  );

  useEffect(() => {
    void refresh();
    return () => activeRequest.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (!moduleKey) return;
    const refreshOnFocus = () => void refresh();
    const refreshTimer = window.setInterval(
      refreshOnFocus,
      MODULE_ACCESS_REFRESH_MS,
    );
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [moduleKey, refresh]);

  return {
    access: moduleKey ? (moduleLocks[moduleKey] ?? "free") : "free",
    loading,
    refresh,
  } as const;
}
