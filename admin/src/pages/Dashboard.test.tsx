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
});
