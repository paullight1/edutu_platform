import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiClient";
import { useEngineDiagnostics } from "./useEngineDiagnostics";

const mocks = vi.hoisted(() => ({
  adminApiJson: vi.fn(),
  getStatus: vi.fn(),
  getAdminRuntimeConfig: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

vi.mock("../../../lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/apiClient")>();
  return { ...actual, adminApiJson: mocks.adminApiJson };
});

vi.mock("../../../lib/runtimeConfig", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../lib/runtimeConfig")
  >();
  return {
    ...actual,
    getAdminRuntimeConfig: mocks.getAdminRuntimeConfig,
  };
});

vi.mock("../api/engineApi", () => ({
  engineApi: { getStatus: mocks.getStatus },
}));

function healthyEngineStatus() {
  return {
    success: true,
    runtime: {
      service: "edutu-api" as const,
      environment: "production",
      version: "2026.8.23",
      commit: "abc123def456",
      startedAt: "2026-08-23T20:00:00.000Z",
    },
    database: { configured: true, reachable: true },
    ai: {
      deepseekConfigured: true,
      geminiConfigured: false,
      source: "env",
      feature: "scraper.extract",
      provider: "deepseek",
      model: "deepseek-chat",
      enabled: true,
    },
    scraper: {
      schedulerEnabled: true,
      autoRunEnabled: true,
      cronSchedule: "0 0 * * *",
      cronTimezone: "UTC",
      cronArmed: true,
      nextRunAt: "2026-08-24T00:00:00.000Z",
      egressRoute: "direct",
      dataRetentionDays: null,
      recheckAfterDays: 3,
      enrichConcurrency: 3,
      maxPagesCap: 25,
      minPublishQualityScore: 60,
    },
  };
}

describe("useEngineDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminRuntimeConfig.mockReturnValue({
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    });
    mocks.adminApiJson.mockImplementation((path: string) => {
      if (path === "/health/live") {
        return Promise.resolve({
          status: "ok",
          timestamp: "2026-08-23T20:00:00.000Z",
          uptimeSeconds: 300,
          version: "2026.8.23",
          checks: { process: { status: "up" } },
        });
      }
      if (path === "/health/ready") {
        return Promise.resolve({
          status: "ready",
          timestamp: "2026-08-23T20:00:00.000Z",
          uptimeSeconds: 300,
          version: "2026.8.23",
          checks: {
            database: { status: "up", responseTimeMs: 12 },
            ai: {
              status: "up",
              providers: { gemini: "missing", openrouter: "missing" },
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });
    mocks.getStatus.mockResolvedValue(healthyEngineStatus());
  });

  it("derives explicit healthy checks and deployment identity", async () => {
    const { result } = renderHook(() => useEngineDiagnostics());

    await waitFor(() =>
      expect(result.current.engineStatus.status).toBe("success"),
    );

    expect(result.current.runtimeConfig).toMatchObject({
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
    });
    expect(result.current.liveness.status).toBe("success");
    expect(result.current.readiness.status).toBe("success");
    expect(result.current.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "api-live", severity: "success" }),
        expect.objectContaining({ code: "api-ready", severity: "success" }),
        expect.objectContaining({
          code: "database-connected",
          severity: "success",
        }),
        expect.objectContaining({
          code: "runtime-identified",
          severity: "success",
        }),
        expect.objectContaining({
          code: "scheduler-armed",
          severity: "success",
        }),
        expect.objectContaining({
          code: "ai-provider-configured",
          severity: "success",
        }),
      ]),
    );
  });

  it("detects scheduler intent drift and an enabled AI route without a key", async () => {
    mocks.getStatus.mockResolvedValue({
      ...healthyEngineStatus(),
      ai: {
        ...healthyEngineStatus().ai,
        deepseekConfigured: false,
        geminiConfigured: false,
      },
      scraper: {
        ...healthyEngineStatus().scraper,
        autoRunEnabled: true,
        cronArmed: false,
      },
    });

    const { result } = renderHook(() => useEngineDiagnostics());
    await waitFor(() =>
      expect(result.current.engineStatus.status).toBe("success"),
    );

    expect(result.current.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "scheduler-intent-not-armed",
          severity: "error",
        }),
        expect.objectContaining({
          code: "ai-route-without-key",
          severity: "error",
        }),
      ]),
    );
  });

  it("keeps API liveness separate from readiness failure and preserves the request ID", async () => {
    mocks.adminApiJson.mockImplementation((path: string) => {
      if (path === "/health/live") {
        return Promise.resolve({
          status: "ok",
          timestamp: "2026-08-23T20:00:00.000Z",
          uptimeSeconds: 300,
          version: "2026.8.23",
          checks: { process: { status: "up" } },
        });
      }
      return Promise.reject(
        new AdminApiError({
          message: "The admin API request failed (503). Reference ready-503.",
          category: "http",
          status: 503,
          requestId: "ready-503",
          targetOrigin: "https://edutu-api.onrender.com",
          elapsedMs: 40,
        }),
      );
    });

    const { result } = renderHook(() => useEngineDiagnostics());
    await waitFor(() => expect(result.current.readiness.status).toBe("error"));

    expect(result.current.liveness.status).toBe("success");
    expect(result.current.readiness.error?.requestId).toBe("ready-503");
    expect(result.current.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "api-live", severity: "success" }),
        expect.objectContaining({
          code: "api-not-ready",
          severity: "error",
          requestId: "ready-503",
        }),
      ]),
    );
  });
});
