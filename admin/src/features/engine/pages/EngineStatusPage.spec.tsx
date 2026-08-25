import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import type { EngineAutomationState } from "../hooks/useEngineAutomation";
import type { EngineDiagnosticsState } from "../hooks/useEngineDiagnostics";
import EngineStatusPage from "./EngineStatusPage";

const mocks = vi.hoisted(() => ({
  useEngineDiagnostics: vi.fn(),
  useEngineAutomation: vi.fn(),
  refresh: vi.fn(),
  automationRefresh: vi.fn(),
  saveSettings: vi.fn(),
  purgeExpired: vi.fn(),
}));

vi.mock("../hooks/useEngineDiagnostics", () => ({
  useEngineDiagnostics: mocks.useEngineDiagnostics,
}));

vi.mock("../hooks/useEngineAutomation", () => ({
  useEngineAutomation: mocks.useEngineAutomation,
}));

function diagnosticState(): EngineDiagnosticsState {
  const readinessError = new AdminApiError({
    message: "The admin API request failed (503). Reference ready-503.",
    category: "http",
    status: 503,
    requestId: "ready-503",
    targetOrigin: "https://edutu-api.onrender.com",
    elapsedMs: 42,
  });

  return {
    runtimeConfig: {
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    },
    runtimeConfigError: null,
    liveness: {
      status: "success",
      data: {
        status: "ok",
        timestamp: "2026-08-23T20:00:00.000Z",
        uptimeSeconds: 300,
        version: "2026.8.23",
        checks: { process: { status: "up" } },
      },
      error: null,
    },
    readiness: {
      status: "error",
      data: null,
      error: readinessError,
    },
    engineStatus: {
      status: "success",
      data: {
        success: true,
        runtime: {
          service: "edutu-api",
          environment: "production",
          version: "2026.8.23",
          commit: "abc123def456",
          startedAt: "2026-08-23T19:55:00.000Z",
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
          cronTimezone: "Africa/Lagos",
          cronArmed: true,
          nextRunAt: "2026-08-24T00:00:00.000Z",
          egressRoute: "direct",
          dataRetentionDays: 30,
          recheckAfterDays: 3,
          enrichConcurrency: 3,
          maxPagesCap: 25,
          minPublishQualityScore: 60,
        },
      },
      error: null,
    },
    checks: [
      {
        code: "api-live",
        label: "API liveness",
        severity: "success",
        message: "The API process is accepting health checks.",
      },
      {
        code: "api-not-ready",
        label: "API readiness",
        severity: "error",
        message: "The API is live but its readiness dependencies are unavailable.",
        requestId: "ready-503",
      },
      {
        code: "database-connected",
        label: "Engine database",
        severity: "success",
        message: "The Engine database is configured and reachable.",
      },
      {
        code: "ai-provider-configured",
        label: "AI extraction provider",
        severity: "success",
        message: "deepseek / deepseek-chat is configured.",
      },
      {
        code: "scheduler-armed",
        label: "Engine scheduler",
        severity: "success",
        message: "The scheduler is armed.",
      },
    ],
    refresh: mocks.refresh,
  };
}

function automationState(): EngineAutomationState {
  return {
    settings: {
      status: "success",
      data: {
        auto_run_enabled: true,
        cron_schedule: "0 0 * * *",
        data_retention_days: 30,
        recheck_after_days: 3,
      },
      error: null,
    },
    mutationError: null,
    pendingOperations: new Set<string>(),
    refresh: mocks.automationRefresh,
    saveSettings: mocks.saveSettings,
    purgeExpired: mocks.purgeExpired,
  };
}

describe("EngineStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
    mocks.automationRefresh.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.purgeExpired.mockResolvedValue({ deletedCount: 0 });
    mocks.useEngineDiagnostics.mockReturnValue(diagnosticState());
    mocks.useEngineAutomation.mockReturnValue(automationState());
  });

  it("renders the effective admin target and API deployment identity", () => {
    render(<EngineStatusPage />);

    expect(
      screen.getByRole("heading", { name: "Engine status" }),
    ).toBeInTheDocument();
    expect(screen.getByText("https://edutu-api.onrender.com")).toBeVisible();
    expect(screen.getByText("VITE_BACKEND_URL")).toBeVisible();
    expect(screen.getByText("2026.8.23")).toBeVisible();
    expect(screen.getByText("abc123def456")).toBeVisible();
    expect(screen.getByText("production")).toBeVisible();
  });

  it("shows database, AI, scheduler, and policy state as separate facts", () => {
    render(<EngineStatusPage />);

    const database = screen.getByRole("region", { name: "Engine database" });
    expect(within(database).getByText("Configured")).toBeVisible();
    expect(within(database).getByText("Reachable")).toBeVisible();

    const ai = screen.getByRole("region", { name: "AI extraction provider" });
    expect(within(ai).getByText("deepseek")).toBeVisible();
    expect(within(ai).getByText("deepseek-chat")).toBeVisible();
    expect(within(ai).getByText("Key available")).toBeVisible();

    const scheduler = screen.getByRole("region", { name: "Engine scheduler" });
    expect(within(scheduler).getByText("Automatic runs enabled")).toBeVisible();
    expect(within(scheduler).getByText("Cron armed")).toBeVisible();
    expect(within(scheduler).getByText("0 0 * * *")).toBeVisible();
    expect(within(scheduler).getByText("Africa/Lagos")).toBeVisible();

    const policy = screen.getByRole("region", { name: "Engine policy" });
    expect(within(policy).getByText("3 concurrent enrichers")).toBeVisible();
    expect(within(policy).getByText("25 pages maximum")).toBeVisible();
    expect(within(policy).getByText("60+ publish score")).toBeVisible();
    expect(within(policy).getByText("30 days retention")).toBeVisible();
  });

  it("keeps liveness distinct from readiness failure and surfaces the request ID", async () => {
    const user = userEvent.setup();
    render(<EngineStatusPage />);

    expect(screen.getByText("API process live")).toBeVisible();
    expect(screen.getByText("API not ready")).toBeVisible();
    expect(screen.getAllByText("ready-503").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/required dependencies are unavailable/i),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.automationRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows actionable remediation when the database is not configured", () => {
    const state = diagnosticState();
    const currentStatus = state.engineStatus.data;
    if (!currentStatus) throw new Error("Expected Engine status fixture");

    state.engineStatus = {
      ...state.engineStatus,
      data: {
        ...currentStatus,
        database: { configured: false, reachable: false },
      },
    };
    state.checks = [
      {
        code: "database-not-configured",
        label: "Engine database",
        severity: "error",
        message:
          "The Engine database client is not configured on the deployed API.",
      },
    ];
    mocks.useEngineDiagnostics.mockReturnValue(state);

    render(<EngineStatusPage />);

    expect(screen.getByText("Database configuration missing")).toBeVisible();
    expect(
      screen.getByText(/required Supabase server credentials/i),
    ).toBeVisible();
  });

  it("does not recreate Sources, Live Runs, or Status page navigation", () => {
    render(<EngineStatusPage />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sources" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Live Runs" }),
    ).not.toBeInTheDocument();
  });
});
