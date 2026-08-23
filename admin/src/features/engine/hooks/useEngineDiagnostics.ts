import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApiJson } from "../../../lib/apiClient";
import {
  getAdminRuntimeConfig,
  type AdminRuntimeConfig,
} from "../../../lib/runtimeConfig";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type { EngineStatus } from "../model/types";

export interface ApiLivenessStatus {
  status: "ok";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: { process: { status: "up" } };
}

export interface ApiReadinessStatus {
  status: "ready" | "not_ready";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: Record<string, unknown>;
}

export type DiagnosticSeverity = "success" | "info" | "warning" | "error";

export interface EngineDiagnosticCheck {
  code: string;
  label: string;
  severity: DiagnosticSeverity;
  message: string;
  requestId?: string;
}

export interface EngineDiagnosticsState {
  runtimeConfig: AdminRuntimeConfig | null;
  runtimeConfigError: Error | null;
  liveness: EngineResourceState<ApiLivenessStatus>;
  readiness: EngineResourceState<ApiReadinessStatus>;
  engineStatus: EngineResourceState<EngineStatus>;
  checks: EngineDiagnosticCheck[];
  refresh(): Promise<void>;
}

interface DiagnosticResources {
  liveness: EngineResourceState<ApiLivenessStatus>;
  readiness: EngineResourceState<ApiReadinessStatus>;
  engineStatus: EngineResourceState<EngineStatus>;
}

interface RuntimeConfigResult {
  config: AdminRuntimeConfig | null;
  error: Error | null;
}

function readRuntimeConfig(): RuntimeConfigResult {
  try {
    return { config: getAdminRuntimeConfig(), error: null };
  } catch (error) {
    return {
      config: null,
      error:
        error instanceof Error
          ? error
          : new Error("Admin runtime configuration is unavailable."),
    };
  }
}

function createInitialResources(): DiagnosticResources {
  return {
    liveness: idleResource(),
    readiness: idleResource(),
    engineStatus: idleResource(),
  };
}

function settleResource<T>(
  result: PromiseSettledResult<T>,
  previous: EngineResourceState<T>,
  message: string,
): EngineResourceState<T> {
  if (result.status === "fulfilled") {
    return successResource(result.value);
  }

  return errorResource(result.reason, message, previous.data);
}

function check(
  code: string,
  label: string,
  severity: DiagnosticSeverity,
  message: string,
  requestId?: string,
): EngineDiagnosticCheck {
  return { code, label, severity, message, requestId };
}

export function buildDiagnosticChecks(input: {
  runtimeConfig: AdminRuntimeConfig | null;
  runtimeConfigError: Error | null;
  liveness: EngineResourceState<ApiLivenessStatus>;
  readiness: EngineResourceState<ApiReadinessStatus>;
  engineStatus: EngineResourceState<EngineStatus>;
}): EngineDiagnosticCheck[] {
  const checks: EngineDiagnosticCheck[] = [];

  if (input.runtimeConfigError || !input.runtimeConfig) {
    checks.push(
      check(
        "runtime-config-missing",
        "Admin API configuration",
        "error",
        "The production admin API origin is not configured explicitly.",
      ),
    );
  } else if (input.runtimeConfig.legacyAlias) {
    checks.push(
      check(
        "runtime-config-legacy-alias",
        "Admin API configuration",
        "warning",
        `The admin is using the legacy ${input.runtimeConfig.source} compatibility alias.`,
      ),
    );
  } else {
    checks.push(
      check(
        "runtime-config-explicit",
        "Admin API configuration",
        "success",
        `The admin is explicitly targeting ${input.runtimeConfig.apiOrigin || "the development proxy"}.`,
      ),
    );
  }

  if (
    input.liveness.status === "success" &&
    input.liveness.data?.status === "ok"
  ) {
    checks.push(
      check(
        "api-live",
        "API liveness",
        "success",
        "The API process is accepting health checks.",
      ),
    );
  } else if (input.liveness.status === "error") {
    checks.push(
      check(
        "api-unreachable",
        "API liveness",
        "error",
        "The configured API process could not be reached.",
        input.liveness.error?.requestId,
      ),
    );
  } else {
    checks.push(
      check(
        "api-live-pending",
        "API liveness",
        "info",
        "The API liveness check is still pending.",
      ),
    );
  }

  if (
    input.readiness.status === "success" &&
    input.readiness.data?.status === "ready"
  ) {
    checks.push(
      check(
        "api-ready",
        "API readiness",
        "success",
        "The API reports that its required dependencies are ready.",
      ),
    );
  } else if (input.readiness.status === "error") {
    checks.push(
      check(
        "api-not-ready",
        "API readiness",
        "error",
        "The API is live but its readiness dependencies are unavailable.",
        input.readiness.error?.requestId,
      ),
    );
  } else {
    checks.push(
      check(
        "api-readiness-pending",
        "API readiness",
        "info",
        "The API readiness check is still pending.",
      ),
    );
  }

  if (input.engineStatus.status === "error") {
    checks.push(
      check(
        "engine-status-unavailable",
        "Authenticated Engine status",
        "error",
        "The authenticated Engine status endpoint is unavailable.",
        input.engineStatus.error?.requestId,
      ),
    );
    return checks;
  }

  if (input.engineStatus.status !== "success" || !input.engineStatus.data) {
    checks.push(
      check(
        "engine-status-pending",
        "Authenticated Engine status",
        "info",
        "The authenticated Engine status check is still pending.",
      ),
    );
    return checks;
  }

  const status = input.engineStatus.data;

  if (status.runtime?.commit) {
    checks.push(
      check(
        "runtime-identified",
        "API deployment identity",
        "success",
        `The API reports version ${status.runtime.version} at commit ${status.runtime.commit}.`,
      ),
    );
  } else {
    checks.push(
      check(
        "runtime-commit-missing",
        "API deployment identity",
        "warning",
        "The API is reachable but does not report a deployment commit.",
      ),
    );
  }

  if (status.database?.configured && status.database.reachable) {
    checks.push(
      check(
        "database-connected",
        "Engine database",
        "success",
        "The Engine database is configured and reachable.",
      ),
    );
  } else if (!status.database?.configured) {
    checks.push(
      check(
        "database-not-configured",
        "Engine database",
        "error",
        "The Engine database client is not configured on the deployed API.",
      ),
    );
  } else {
    checks.push(
      check(
        "database-unreachable",
        "Engine database",
        "error",
        "The Engine database is configured but its probe failed.",
      ),
    );
  }

  if (!status.ai) {
    checks.push(
      check(
        "ai-status-missing",
        "AI extraction provider",
        "warning",
        "The API did not return an AI extraction configuration.",
      ),
    );
  } else if (!status.ai.enabled) {
    checks.push(
      check(
        "ai-route-disabled",
        "AI extraction provider",
        "warning",
        "The scraper extraction route is disabled.",
      ),
    );
  } else if (
    status.ai.deepseekConfigured ||
    Boolean(status.ai.geminiConfigured)
  ) {
    checks.push(
      check(
        "ai-provider-configured",
        "AI extraction provider",
        "success",
        `${status.ai.provider} / ${status.ai.model} is selected with an available provider key.`,
      ),
    );
  } else {
    checks.push(
      check(
        "ai-route-without-key",
        "AI extraction provider",
        "error",
        `${status.ai.provider} / ${status.ai.model} is enabled without an available provider key.`,
      ),
    );
  }

  const scraper = status.scraper;
  if (!scraper) {
    checks.push(
      check(
        "scheduler-status-missing",
        "Engine scheduler",
        "warning",
        "The API did not return scheduler state.",
      ),
    );
  } else if (!scraper.schedulerEnabled) {
    checks.push(
      check(
        "scheduler-disabled",
        "Engine scheduler",
        "warning",
        "The scheduler is disabled by the deployed API environment.",
      ),
    );
  } else if (scraper.autoRunEnabled && !scraper.cronArmed) {
    checks.push(
      check(
        "scheduler-intent-not-armed",
        "Engine scheduler",
        "error",
        "Automatic runs are enabled in settings, but no cron job is armed.",
      ),
    );
  } else if (scraper.cronArmed) {
    checks.push(
      check(
        "scheduler-armed",
        "Engine scheduler",
        "success",
        scraper.nextRunAt
          ? `The scheduler is armed; the next run is ${scraper.nextRunAt}.`
          : "The scheduler is armed.",
      ),
    );
  } else {
    checks.push(
      check(
        "scheduler-idle",
        "Engine scheduler",
        "info",
        "The scheduler is available, but automatic runs are not enabled.",
      ),
    );
  }

  return checks;
}

export function useEngineDiagnostics(): EngineDiagnosticsState {
  const [runtimeConfigResult] = useState(readRuntimeConfig);
  const [resources, setResources] = useState(createInitialResources);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;

    setResources((previous) => ({
      liveness: loadingResource(previous.liveness),
      readiness: loadingResource(previous.readiness),
      engineStatus: loadingResource(previous.engineStatus),
    }));

    const [livenessResult, readinessResult, engineStatusResult] =
      await Promise.allSettled([
        adminApiJson<ApiLivenessStatus>("/health/live"),
        adminApiJson<ApiReadinessStatus>("/health/ready"),
        engineApi.getStatus(),
      ] as const);

    if (version !== requestVersion.current) return;

    setResources((previous) => ({
      liveness: settleResource(
        livenessResult,
        previous.liveness,
        "API liveness is unavailable.",
      ),
      readiness: settleResource(
        readinessResult,
        previous.readiness,
        "API readiness is unavailable.",
      ),
      engineStatus: settleResource(
        engineStatusResult,
        previous.engineStatus,
        "Authenticated Engine status is unavailable.",
      ),
    }));
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

  const checks = useMemo(
    () =>
      buildDiagnosticChecks({
        runtimeConfig: runtimeConfigResult.config,
        runtimeConfigError: runtimeConfigResult.error,
        ...resources,
      }),
    [resources, runtimeConfigResult.config, runtimeConfigResult.error],
  );

  return {
    runtimeConfig: runtimeConfigResult.config,
    runtimeConfigError: runtimeConfigResult.error,
    ...resources,
    checks,
    refresh,
  };
}
