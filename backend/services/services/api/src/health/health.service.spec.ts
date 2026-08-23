import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import {
  type DatabaseHealthProbe,
  HealthService,
  type ReadinessStatus,
} from "./health.service";

describe("HealthService", () => {
  const originalAppVersion = process.env.APP_VERSION;
  const originalHealthTimeout = process.env.DATABASE_HEALTH_TIMEOUT_MS;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();

    if (originalAppVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalAppVersion;

    if (originalHealthTimeout === undefined) {
      delete process.env.DATABASE_HEALTH_TIMEOUT_MS;
    } else {
      process.env.DATABASE_HEALTH_TIMEOUT_MS = originalHealthTimeout;
    }
  });

  it("reports process liveness without probing the database", () => {
    const probe: DatabaseHealthProbe = { ping: jest.fn() };
    const service = new HealthService(probe);

    const result = service.getLiveness();

    expect(result).toMatchObject({
      status: "ok",
      checks: { process: { status: "up" } },
    });
    expect(result.timestamp).toEqual(expect.any(String));
    expect(result.uptimeSeconds).toEqual(expect.any(Number));
    expect(probe.ping).not.toHaveBeenCalled();
  });

  it("reports ready only after the canonical database probe succeeds", async () => {
    const probe: DatabaseHealthProbe = {
      ping: jest.fn().mockResolvedValue(undefined),
    };
    const service = new HealthService(probe);

    const result = await service.getReadiness();

    expect(probe.ping).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "ready",
      checks: {
        database: {
          status: "up",
          responseTimeMs: expect.any(Number),
        },
      },
    });
  });

  it("fails closed without leaking database errors when the probe fails", async () => {
    const probe: DatabaseHealthProbe = {
      ping: jest.fn().mockRejectedValue(new Error("postgres password leaked")),
    };
    const service = new HealthService(probe);

    const result = await service.getReadiness();

    expect(result).toMatchObject({
      status: "not_ready",
      checks: {
        database: {
          status: "down",
          reason: "query_failed",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("postgres password leaked");
  });

  it("bounds the database probe and reports timeout instead of hanging", async () => {
    jest.useFakeTimers();
    process.env.DATABASE_HEALTH_TIMEOUT_MS = "25";
    const probe: DatabaseHealthProbe = {
      ping: jest.fn(() => new Promise<void>(() => undefined)),
    };
    const service = new HealthService(probe);

    const readiness = service.getReadiness();
    await jest.advanceTimersByTimeAsync(25);

    await expect(readiness).resolves.toMatchObject({
      status: "not_ready",
      checks: {
        database: {
          status: "down",
          reason: "timeout",
        },
      },
    });
  });
});

describe("HealthController", () => {
  const notReady: ReadinessStatus = {
    status: "not_ready",
    timestamp: "2026-08-23T00:00:00.000Z",
    uptimeSeconds: 1,
    version: "test",
    checks: {
      database: {
        status: "down",
        responseTimeMs: 10,
        reason: "query_failed",
      },
      ai: {
        status: "degraded",
        providers: { gemini: "missing", openrouter: "missing" },
      },
    },
  };

  it("keeps /health as a backward-compatible readiness alias", async () => {
    const healthService = {
      getReadiness: jest.fn().mockResolvedValue({ ...notReady, status: "ready" }),
      getLiveness: jest.fn(),
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    await controller.check();

    expect(healthService.getReadiness).toHaveBeenCalledTimes(1);
  });

  it("returns HTTP 503 semantics when readiness dependencies are down", async () => {
    const healthService = {
      getReadiness: jest.fn().mockResolvedValue(notReady),
      getLiveness: jest.fn(),
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    try {
      await controller.ready();
      throw new Error("expected readiness to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const unavailable = error as ServiceUnavailableException;
      expect(unavailable.getStatus()).toBe(503);
      expect(unavailable.getResponse()).toEqual(notReady);
    }
  });
});
