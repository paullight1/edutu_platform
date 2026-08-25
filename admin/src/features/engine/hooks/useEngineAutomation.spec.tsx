import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import type { AutomationSettings } from "../model/types";
import { useEngineAutomation } from "./useEngineAutomation";

const api = vi.hoisted(() => ({
  getAutomationSettings: vi.fn(),
  updateAutomationSettings: vi.fn(),
  purgeOpportunities: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

const initialSettings: AutomationSettings = {
  auto_run_enabled: false,
  cron_schedule: "0 0 * * *",
  data_retention_days: 90,
  recheck_after_days: 3,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useEngineAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAutomationSettings.mockResolvedValue(initialSettings);
    api.updateAutomationSettings.mockResolvedValue({ success: true });
    api.purgeOpportunities.mockResolvedValue({
      success: true,
      deletedCount: 12,
    });
  });

  it("keeps a failed settings request distinct from a loaded default", async () => {
    api.getAutomationSettings.mockRejectedValue(new Error("settings offline"));

    const { result } = renderHook(() => useEngineAutomation());

    await waitFor(() => expect(result.current.settings.status).toBe("error"));
    expect(result.current.settings.data).toBeNull();
    expect(result.current.settings.error).not.toBeNull();
  });

  it("does not claim a settings change until the API confirms it", async () => {
    const pending = deferred<{ success: boolean }>();
    api.updateAutomationSettings.mockReturnValue(pending.promise);
    const nextSettings: AutomationSettings = {
      ...initialSettings,
      auto_run_enabled: true,
      cron_schedule: "0 */6 * * *",
    };

    const { result } = renderHook(() => useEngineAutomation());
    await waitFor(() => expect(result.current.settings.status).toBe("success"));

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.saveSettings(nextSettings);
    });

    expect(result.current.settings.data).toEqual(initialSettings);
    expect(result.current.pendingOperations.has("save-settings")).toBe(true);

    await act(async () => {
      pending.resolve({ success: true });
      await saving;
    });

    expect(result.current.settings.data).toEqual(nextSettings);
    expect(result.current.pendingOperations.has("save-settings")).toBe(false);
    expect(result.current.mutationError).toBeNull();
  });

  it("preserves prior settings and the request ID when a save fails", async () => {
    const failure = new AdminApiError({
      message: "Settings update failed. Reference req-settings-1.",
      category: "http",
      status: 503,
      requestId: "req-settings-1",
      targetOrigin: "https://api.example.org",
      elapsedMs: 32,
    });
    api.updateAutomationSettings.mockRejectedValue(failure);

    const { result } = renderHook(() => useEngineAutomation());
    await waitFor(() => expect(result.current.settings.status).toBe("success"));

    await act(async () => {
      await expect(
        result.current.saveSettings({
          ...initialSettings,
          data_retention_days: 30,
        }),
      ).rejects.toBe(failure);
    });

    expect(result.current.settings.data).toEqual(initialSettings);
    expect(result.current.mutationError).toMatchObject({
      requestId: "req-settings-1",
      category: "http",
    });
  });

  it("purges only through the explicit retention action and reports the server count", async () => {
    const { result } = renderHook(() => useEngineAutomation());
    await waitFor(() => expect(result.current.settings.status).toBe("success"));

    let outcome;
    await act(async () => {
      outcome = await result.current.purgeExpired(120);
    });

    expect(api.purgeOpportunities).toHaveBeenCalledWith(120);
    expect(outcome).toEqual({ deletedCount: 12 });
    expect(result.current.pendingOperations.has("purge-opportunities")).toBe(false);
  });
});
