import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { CrescivaEngineGuard } from "./cresciva-engine.guard";

function context(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: key ? { "x-cresciva-engine-key": key } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("CrescivaEngineGuard", () => {
  const previous = process.env.CRESCIVA_ENGINE_API_KEY;
  afterEach(() => {
    process.env.CRESCIVA_ENGINE_API_KEY = previous;
  });

  it("accepts the configured service key", () => {
    process.env.CRESCIVA_ENGINE_API_KEY = "a".repeat(32);
    expect(new CrescivaEngineGuard().canActivate(context("a".repeat(32)))).toBe(
      true,
    );
  });

  it("rejects missing or incorrect keys", () => {
    process.env.CRESCIVA_ENGINE_API_KEY = "a".repeat(32);
    expect(() =>
      new CrescivaEngineGuard().canActivate(context("b".repeat(32))),
    ).toThrow(UnauthorizedException);
  });

  it("fails closed when the integration is unconfigured", () => {
    delete process.env.CRESCIVA_ENGINE_API_KEY;
    expect(() => new CrescivaEngineGuard().canActivate(context())).toThrow(
      ServiceUnavailableException,
    );
  });
});
