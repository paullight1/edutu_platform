import { Logger } from "@nestjs/common";
import { AiService } from "./ai.service";
import type { AiEncryptionService } from "./ai-encryption.service";
import type { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import type { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import type { AiChatResult, AiChatStreamResult } from "./ai.types";

// Route resolution and usage logging both hit Postgres; stub the module so the
// service exercises its real control flow without opening a connection.
jest.mock("../db", () => {
  const emptySelect: any = {
    from: () => emptySelect,
    where: () => emptySelect,
    orderBy: () => emptySelect,
    limit: () => emptySelect,
    execute: () => Promise.resolve([]),
  };
  // Parked on globalThis because a jest.mock factory may not close over
  // module-scope bindings (they are not initialised when the factory runs).
  const rows: Array<Record<string, any>> = [];
  (globalThis as Record<string, any>).__aiUsageRows = rows;
  return {
    db: {
      select: () => emptySelect,
      insert: () => ({
        values: (row: Record<string, any>) => {
          rows.push(row);
          return Promise.resolve(undefined);
        },
      }),
    },
  };
});

/** Every row written to ai_usage_logs / ai_usage_events by the service. */
const usageRows = (): Array<Record<string, any>> =>
  (globalThis as Record<string, any>).__aiUsageRows;

const CHAT_OPTIONS = {
  feature: "chat.agent",
  messages: [{ role: "user" as const, content: "wrap up" }],
};

function buildService(deepseek: Partial<DeepSeekAdapter>) {
  const encryption = {
    decrypt: (value: string) => value,
  } as unknown as AiEncryptionService;

  return new AiService(
    encryption,
    { provider: "deepseek", ...deepseek } as unknown as DeepSeekAdapter,
    { provider: "gemini" } as unknown as GeminiAdapter,
    { provider: "openrouter" } as unknown as OpenRouterAdapter,
  );
}

describe("AiService.generateChatStream", () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    usageRows().length = 0;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it("streams deltas and returns the complete text", async () => {
    const service = buildService({
      generateChat: jest.fn(),
      generateChatStream: jest.fn(async (_config, options) => {
        options.onToken("Hel");
        options.onToken("lo");
        return {
          text: "Hello",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
          usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
        } as AiChatStreamResult;
      }),
    });

    const tokens: string[] = [];
    const result = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: (delta) => tokens.push(delta),
    });

    expect(tokens).toEqual(["Hel", "lo"]);
    expect(result.text).toBe("Hello");
  });

  it("falls back to the buffered call when the stream never establishes", async () => {
    const generateChat = jest.fn(
      async () =>
        ({
          text: "buffered answer",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiChatResult,
    );
    const service = buildService({
      generateChat,
      generateChatStream: jest.fn(async () => {
        throw new Error("DeepSeek chat stream request failed: 503");
      }),
    });

    // The fall-back path warns by design; keep the test output pristine.
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const tokens: string[] = [];
    const result = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: (delta) => tokens.push(delta),
    });

    expect(tokens).toEqual([]);
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("buffered answer");
  });

  it("does not retry or fall back after the caller aborts", async () => {
    const controller = new AbortController();
    const generateChat = jest.fn(async () =>
      ({
        text: "buffered answer",
        toolCalls: [],
        provider: "deepseek",
        model: "deepseek-chat",
      }) as AiChatResult,
    );
    const abortError = Object.assign(new Error("client disconnected"), {
      name: "AbortError",
    });
    const service = buildService({
      generateChat,
      generateChatStream: jest.fn(async () => {
        throw abortError;
      }),
    });
    controller.abort(abortError);

    await expect(
      service.generateChatStream({
        ...CHAT_OPTIONS,
        signal: controller.signal,
        onToken: () => undefined,
      }),
    ).rejects.toBe(abortError);
    expect(generateChat).not.toHaveBeenCalled();
  });

  it("never replays a round once tokens have reached the user", async () => {
    const generateChat = jest.fn();
    const service = buildService({
      generateChat,
      generateChatStream: jest.fn(async (_config, options) => {
        options.onToken("partial ");
        throw new Error("socket hang up");
      }),
    });

    const tokens: string[] = [];
    await expect(
      service.generateChatStream({
        ...CHAT_OPTIONS,
        onToken: (delta) => tokens.push(delta),
      }),
    ).rejects.toThrow("socket hang up");

    expect(tokens).toEqual(["partial "]);
    expect(generateChat).not.toHaveBeenCalled();
  });

  // Fix 4 — a provider that omits the final usage frame (the OpenRouter risk)
  // used to land a row with null tokens and $0.00000000 for the largest-context
  // call of the turn, which is indistinguishable from a genuinely free call.
  it("records estimated tokens and a real cost when the usage frame is missing", async () => {
    const answer = "x".repeat(400);
    const service = buildService({
      generateChat: jest.fn(),
      generateChatStream: jest.fn(async (_config, options) => {
        options.onToken(answer);
        return {
          text: answer,
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        } as AiChatStreamResult;
      }),
    });

    await service.generateChatStream({
      ...CHAT_OPTIONS,
      messages: [{ role: "user", content: "y".repeat(2000) }],
      onToken: () => undefined,
    });

    const event = usageRows().find((row) => "estimatedCostUsd" in row)!;
    expect(event.promptTokens).toBeGreaterThan(0);
    expect(event.completionTokens).toBeGreaterThan(0);
    expect(Number(event.estimatedCostUsd)).toBeGreaterThan(0);
    // Estimated rows stay distinguishable from provider-reported ones.
    const log = usageRows().find((row) => "requestMetadata" in row)!;
    expect(log.requestMetadata).toMatchObject({ tokenUsage: "estimated" });
  });

  it("keeps provider-reported token counts exactly as reported", async () => {
    const service = buildService({
      generateChat: jest.fn(),
      generateChatStream: jest.fn(async () => {
        return {
          text: "hello",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
          usage: { promptTokens: 11, completionTokens: 3, totalTokens: 14 },
        } as AiChatStreamResult;
      }),
    });

    const result = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: () => undefined,
    });

    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 3,
      totalTokens: 14,
    });
    const event = usageRows().find((row) => "estimatedCostUsd" in row)!;
    expect(event.promptTokens).toBe(11);
    const log = usageRows().find((row) => "requestMetadata" in row)!;
    expect(log.requestMetadata).not.toHaveProperty("tokenUsage");
  });

  // A2c item 1 — the marker used to live only on ai_usage_logs.request_metadata,
  // so the ai_usage_events row that finance actually queries could not tell an
  // estimate from a measurement.
  it("marks the cost-table row itself when the tokens are estimated", async () => {
    const answer = "x".repeat(400);
    const service = buildService({
      generateChat: jest.fn(),
      generateChatStream: jest.fn(async (_config, options) => {
        options.onToken(answer);
        return {
          text: answer,
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        } as AiChatStreamResult;
      }),
    });

    await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: () => undefined,
    });

    const event = usageRows().find((row) => "estimatedCostUsd" in row)!;
    expect(event.tokenSource).toBe("estimated");
    // `route` stays the plain feature name — per-route spend aggregates must
    // not split just because one call's tokens were estimated.
    expect(event.route).toBe("chat.agent");
  });

  it("leaves the cost-table row unmarked when the provider reported tokens", async () => {
    const service = buildService({
      generateChat: jest.fn(),
      generateChatStream: jest.fn(
        async () =>
          ({
            text: "hello",
            toolCalls: [],
            provider: "deepseek",
            model: "deepseek-chat",
            usage: { promptTokens: 11, completionTokens: 3, totalTokens: 14 },
          }) as AiChatStreamResult,
      ),
    });

    await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: () => undefined,
    });

    const event = usageRows().find((row) => "estimatedCostUsd" in row)!;
    // Marker key absent from the values object passed to the mocked
    // `values()` for the non-estimated case. Note: this does NOT show
    // anything about the emitted SQL — Drizzle's insert builder names every
    // schema column regardless of what `.values()` omits, so the generated
    // INSERT still lists `token_source` (as `default`) on every call. This
    // assertion only pins that the key stays unset here for non-estimated
    // reads; it is not deploy-safety evidence.
    expect(event).not.toHaveProperty("tokenSource");
  });

  it("uses the buffered call when the routed adapter cannot stream", async () => {
    const generateChat = jest.fn(
      async () =>
        ({
          text: "no streaming here",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiChatResult,
    );
    const service = buildService({ generateChat });

    const result = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: () => undefined,
    });

    expect(result.text).toBe("no streaming here");
    expect(generateChat).toHaveBeenCalledTimes(1);
  });
});
