import { Inject, Injectable } from "@nestjs/common";

export const DATABASE_HEALTH_PROBE = Symbol("DATABASE_HEALTH_PROBE");

const DEFAULT_DATABASE_HEALTH_TIMEOUT_MS = 2_000;
const MAX_DATABASE_HEALTH_TIMEOUT_MS = 10_000;

export interface DatabaseHealthProbe {
  ping(): Promise<void>;
}

export interface LivenessStatus {
  status: "ok";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    process: {
      status: "up";
      memoryMb: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
      };
    };
  };
}

export interface ReadinessStatus {
  status: "ready" | "not_ready";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    database: {
      status: "up" | "down";
      responseTimeMs: number;
      reason?: "query_failed" | "timeout";
    };
    ai: {
      status: "configured" | "degraded";
      providers: {
        gemini: "configured" | "missing";
        openrouter: "configured" | "missing";
      };
    };
  };
}

class DatabaseProbeTimeoutError extends Error {
  constructor() {
    super("Database health probe timed out");
    this.name = "DatabaseProbeTimeoutError";
  }
}

function positiveBoundedNumber(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    @Inject(DATABASE_HEALTH_PROBE)
    private readonly databaseProbe: DatabaseHealthProbe,
  ) {}

  getLiveness(): LivenessStatus {
    const memory = process.memoryUsage();

    return {
      ...this.baseStatus(),
      status: "ok",
      checks: {
        process: {
          status: "up",
          memoryMb: {
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
            rss: Math.round(memory.rss / 1024 / 1024),
          },
        },
      },
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    const database = await this.checkDatabase();

    return {
      ...this.baseStatus(),
      status: database.status === "up" ? "ready" : "not_ready",
      checks: {
        database,
        ai: this.checkAIProviders(),
      },
    };
  }

  private baseStatus() {
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      version:
        process.env.APP_VERSION ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.RENDER_GIT_COMMIT ||
        process.env.npm_package_version ||
        "unknown",
    };
  }

  private async checkDatabase(): Promise<
    ReadinessStatus["checks"]["database"]
  > {
    const startedAt = Date.now();
    const timeoutMs = positiveBoundedNumber(
      process.env.DATABASE_HEALTH_TIMEOUT_MS,
      DEFAULT_DATABASE_HEALTH_TIMEOUT_MS,
      MAX_DATABASE_HEALTH_TIMEOUT_MS,
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.databaseProbe.ping(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new DatabaseProbeTimeoutError()),
            timeoutMs,
          );
        }),
      ]);

      return {
        status: "up",
        responseTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: "down",
        responseTimeMs: Date.now() - startedAt,
        reason:
          error instanceof DatabaseProbeTimeoutError
            ? "timeout"
            : "query_failed",
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private checkAIProviders(): ReadinessStatus["checks"]["ai"] {
    const providers = {
      gemini: process.env.GEMINI_API_KEY
        ? ("configured" as const)
        : ("missing" as const),
      openrouter: process.env.OPENROUTER_API_KEY
        ? ("configured" as const)
        : ("missing" as const),
    };

    return {
      status:
        providers.gemini === "configured" ||
        providers.openrouter === "configured"
          ? "configured"
          : "degraded",
      providers,
    };
  }
}
