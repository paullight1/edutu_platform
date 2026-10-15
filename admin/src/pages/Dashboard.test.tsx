// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendFetchJson } from "../lib/backend";
import Dashboard from "./Dashboard";

vi.mock("../lib/backend", () => ({
  backendFetchJson: vi.fn(),
}));

const mockedBackendFetchJson = vi.mocked(backendFetchJson);

const readyHealthResponse = {
  timestamp: "2026-08-25T16:27:53.501Z",
  uptimeSeconds: 36,
  version: "0.0.1",
  status: "ready",
  checks: {
    database: { status: "up", responseTimeMs: 174 },
    ai: {
      status: "configured",
      providers: {
        gemini: "missing",
        openrouter: "configured",
      },
    },
  },
} as const;

let healthResponse: object = readyHealthResponse;

describe("Dashboard health telemetry", () => {
  beforeEach(() => {
    healthResponse = readyHealthResponse;
    mockedBackendFetchJson.mockImplementation(async (path: string) => {
      if (path === "/admin/dashboard") {
        return {
          success: true,
          source: "database",
          stats: {
            totalUsers: 279,
            activeOpportunities: 312,
            applications: 107,
            approvedCreators: 0,
            pendingCreators: 0,
            newUsersThisWeek: 141,
            newOpportunitiesThisWeek: 145,
          },
          recentActivity: [],
        };
      }

      if (path === "/health") {
        return healthResponse;
      }

      if (path === "/admin/ai-usage/summary?days=30") {
        return {
          success: true,
          days: 30,
          totals: {
            calls: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            unpricedCalls: 0,
            errorCount: 0,
          },
          perDay: [],
          perRoute: [],
        };
      }

      throw new Error(`Unexpected backend path: ${path}`);
    });
  });

  it("renders the current backend readiness response without crashing", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("174 ms")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter: configured")).toBeInTheDocument();
  });

  it("renders a failed readiness probe as unavailable rather than crashing", async () => {
    healthResponse = {
      ...readyHealthResponse,
      status: "not_ready",
      checks: {
        ...readyHealthResponse.checks,
        database: {
          status: "down",
          responseTimeMs: 2_000,
          reason: "timeout",
        },
      },
    };

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByText("Not ready")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("marks the platform degraded when no AI provider is configured", async () => {
    healthResponse = {
      ...readyHealthResponse,
      checks: {
        ...readyHealthResponse.checks,
        ai: {
          status: "degraded",
          providers: { gemini: "missing", openrouter: "missing" },
        },
      },
    };

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("AI unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/AI features may fail because neither Gemini nor OpenRouter is configured/i),
    ).toBeInTheDocument();
  });

  it("keeps the dashboard usable when a legacy health payload is returned", async () => {
    healthResponse = {
      status: "ok",
      timestamp: "2026-08-24T16:27:53.501Z",
      uptime: 36,
      database: { status: "connected", responseTime: 174 },
      ai: { gemini: "missing", openrouter: "configured" },
      memory: { heapUsed: 12, heapTotal: 24, rss: 30 },
    };

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(screen.getByText("Live server telemetry unavailable")).toBeVisible();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(1);
  });

  it("does not report $0 when some provider attempts have no configured price", async () => {
    mockedBackendFetchJson.mockImplementation(async (path: string) => {
      if (path === "/admin/dashboard") {
        return {
          success: true,
          source: "database",
          stats: {
            totalUsers: 279,
            activeOpportunities: 312,
            applications: 107,
            approvedCreators: 0,
            pendingCreators: 0,
            newUsersThisWeek: 141,
            newOpportunitiesThisWeek: 145,
          },
          recentActivity: [],
        };
      }
      if (path === "/health") return readyHealthResponse;
      if (path === "/admin/ai-usage/summary?days=30") {
        return {
          success: true,
          days: 30,
          totals: {
            calls: 2,
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            estimatedCostUsd: null,
            unpricedCalls: 2,
            errorCount: 1,
          },
          perDay: [
            {
              day: "2026-10-15",
              totalTokens: 150,
              estimatedCostUsd: null,
              unpricedCalls: 2,
              calls: 2,
            },
          ],
          perRoute: [
            {
              route: "opportunities.extract",
              calls: 2,
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
              estimatedCostUsd: null,
              unpricedCalls: 2,
              errorCount: 1,
              avgLatencyMs: 800,
            },
          ],
        };
      }
      throw new Error(`Unexpected backend path: ${path}`);
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Pricing unavailable for 2 provider attempts"),
    ).toBeVisible();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Provider attempts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed attempts").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/a failed provider attempt may be followed by a successful fallback/i),
    ).toBeVisible();
  });

  it("shows unavailable metrics and a retry action when dashboard data fails", async () => {
    mockedBackendFetchJson.mockImplementation(async (path: string) => {
      if (path === "/admin/dashboard") {
        throw new Error("Your admin session is required or has expired.");
      }
      if (path === "/health") return readyHealthResponse;
      if (path === "/admin/ai-usage/summary?days=30") {
        return {
          success: true,
          days: 30,
          totals: {
            calls: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            unpricedCalls: 0,
            errorCount: 0,
          },
          perDay: [],
          perRoute: [],
        };
      }
      throw new Error(`Unexpected backend path: ${path}`);
    });

    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your admin session is required or has expired.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(
      Array.from(container.querySelectorAll(".dashboard-stat-value")).map(
        (value) => value.textContent,
      ),
    ).toEqual(["—", "—", "—", "—"]);
    expect(screen.getByText("Activity could not be loaded.")).toBeVisible();
  });
});
