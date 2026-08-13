import {
  logSafeObservability,
  safeObservabilityEvent,
} from "./edutu-api-usage.service";
import { RequestIdMiddleware } from "../common/middleware/request-id.middleware";

describe("Edutu API observability", () => {
  it("keeps structured events to safe IDs and operational dimensions", () => {
    const event = safeObservabilityEvent("api request", {
      requestId: "req_123",
      consumerId: "consumer_123",
      ownerUserId: "user_123",
      method: "GET",
      endpoint: "/v1/opportunities",
      billingClass: "credit",
      statusCode: 402,
      statusClass: "4xx",
      latencyMs: 19,
      outcome: "rejected",
      category: "credits_exhausted",
      ...({
        Authorization: "Bearer live-token",
        "x-edutu-api-key": "edu_live_secret",
        apiKey: "edu_live_secret",
        secret: "provider-secret",
        signature: "raw-signature",
        token: "raw-token",
        rawPaymentPayload: { customer: "private" },
        opportunityMetadata: { email: "private@example.com" },
      } as Record<string, unknown>),
    } as never);

    expect(event).toMatchObject({
      event: "api_request",
      service: "edutu-api",
      requestId: "req_123",
      statusCode: 402,
      billingClass: "credit",
      category: "credits_exhausted",
    });
    const serialized = JSON.stringify(event);
    for (const secret of [
      "Authorization",
      "x-edutu-api-key",
      "apiKey",
      "secret",
      "signature",
      "token",
      "rawPaymentPayload",
      "opportunityMetadata",
      "live-token",
      "edu_live_secret",
      "private@example.com",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("redacts control characters and bounds diagnostic strings", () => {
    const event = safeObservabilityEvent("api\nrequest", {
      requestId: ` req\n${"x".repeat(300)} `,
      endpoint: "/v1/usage?authorization=secret",
    });

    expect(event.event).toBe("api_request");
    expect(String(event.requestId)).not.toContain("\n");
    expect(String(event.requestId)).not.toContain("\r");
    expect(String(event.requestId)).not.toContain(String.fromCharCode(0));
    expect(String(event.requestId).length).toBeLessThanOrEqual(200);
    expect(String(event.endpoint)).not.toContain("authorization=secret");
  });

  it("logs JSON without allowing a telemetry failure to need raw context", () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    logSafeObservability(
      logger,
      "api_credit_unavailable",
      {
        requestId: "req_503",
        category: "503",
        outcome: "unavailable",
        paymentPayload: { card: "must-not-appear" },
      } as never,
      "warn",
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logger.warn.mock.calls[0][0] as string);
    expect(record).toMatchObject({
      event: "api_credit_unavailable",
      requestId: "req_503",
      category: "503",
    });
    expect(JSON.stringify(record)).not.toContain("must-not-appear");
  });

  it("replaces malformed request IDs and records safe /v1 response dimensions", () => {
    let finish: (() => void) | undefined;
    const request = {
      headers: { "x-request-id": "bad id\nwith-secret" },
      method: "GET",
      originalUrl: "/v1/opportunities?token=should-not-log",
      url: "/v1/opportunities?token=should-not-log",
    };
    const response = {
      statusCode: 402,
      setHeader: jest.fn(),
      once: jest.fn((_event: string, callback: () => void) => {
        finish = callback;
      }),
    };
    const next = jest.fn();
    const middleware = new RequestIdMiddleware();
    const logger = (middleware as unknown as { logger: { log: jest.Mock } })
      .logger;
    jest.spyOn(logger, "log").mockImplementation(() => undefined);

    middleware.use(request as never, response as never, next);
    finish?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      expect.stringMatching(/^[a-f0-9-]{36}$/),
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logger.log.mock.calls[0][0] as string);
    expect(record).toMatchObject({
      event: "api_http_response",
      statusCode: 402,
      billingClass: "unknown",
      statusClass: "4xx",
    });
    expect(JSON.stringify(record)).not.toContain("should-not-log");
  });
});
