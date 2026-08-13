import { ArgumentsHost, BadRequestException } from "@nestjs/common";
import { EdutuApiExceptionFilter } from "./edutu-api-exception.filter";

describe("EdutuApiExceptionFilter", () => {
  it("redacts raw API keys and hashes from structured error responses", () => {
    const rawKey = "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const hash = "b".repeat(64);
    const json = jest.fn();
    const status = jest.fn().mockReturnThis();
    const request = { edutuRequestId: "req-task3" };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ headersSent: false, status, json }),
      }),
    } as unknown as ArgumentsHost;

    new EdutuApiExceptionFilter().catch(
      new BadRequestException({
        code: "invalid_api_key",
        message: `bad key ${rawKey}`,
        error: { rawKey, apiKeyHash: hash },
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain(rawKey);
    expect(JSON.stringify(body)).not.toContain(hash);
    expect(body).toMatchObject({
      error: { code: "invalid_api_key" },
      requestId: "req-task3",
    });
  });

  it("redacts sensitive values in quota and nested error details", () => {
    const rawKey = "edu_live_a1b2c3d4_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const hash = "c".repeat(64);
    const json = jest.fn();
    const status = jest.fn().mockReturnThis();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ edutuRequestId: "req-task3-quota" }),
        getResponse: () => ({ headersSent: false, status, json }),
      }),
    } as unknown as ArgumentsHost;

    new EdutuApiExceptionFilter().catch(
      new BadRequestException({
        code: "invalid_api_key",
        quota: { rawKey, apiKeyHash: hash },
        error: { details: [{ secret: rawKey }] },
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain(rawKey);
    expect(JSON.stringify(body)).not.toContain(hash);
    expect(body.error.quota).toEqual({});
    expect(body.error.details).toEqual({
      details: [{ secret: "[REDACTED_API_KEY]" }],
    });
  });
});
