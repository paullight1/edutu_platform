import { Logger } from "@nestjs/common";
import { AiService } from "./ai.service";
import type { AiEncryptionService } from "./ai-encryption.service";
import type { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import type { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import type {
  AiChatResult,
  AiChatStreamResult,
  AiGenerateResult,
} from "./ai.types";

// No ai_routes row and no stored keys: the service must reach its built-in
// defaults, which is exactly what these tests are about.
jest.mock("../db", () => {
  const emptySelect: any = {
    from: () => emptySelect,
    where: () => emptySelect,
    orderBy: () => emptySelect,
    limit: () => emptySelect,
    execute: () => Promise.resolve([]),
  };
  return {
    db: {
      select: () => emptySelect,
      insert: () => ({ values: () => Promise.resolve(undefined) }),
    },
  };
});

function buildService(
  deepseek: Partial<DeepSeekAdapter>,
  openRouter: Partial<OpenRouterAdapter>,
  openAi: Record<string, unknown> = {},
) {
  const encryption = {
    decrypt: (value: string) => value,
  } as unknown as AiEncryptionService;

  return new (AiService as any)(
    encryption,
    { provider: "deepseek", ...deepseek } as unknown as DeepSeekAdapter,
    { provider: "gemini" } as unknown as GeminiAdapter,
    { provider: "openrouter", ...openRouter } as unknown as OpenRouterAdapter,
    { provider: "openai", ...openAi },
  );
}

const CHAT_OPTIONS = {
  feature: "chat.agent",
  messages: [{ role: "user" as const, content: "find me a scholarship" }],
};

describe("AiService — provider failover", () => {
  const original = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    // Failover warns by design; keep the test output pristine.
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(original)) {
      const key =
        name === "deepseek"
          ? "DEEPSEEK_API_KEY"
          : name === "openrouter"
            ? "OPENROUTER_API_KEY"
            : "OPENAI_API_KEY";
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it("fails a chat turn over to OpenRouter when DeepSeek is down", async () => {
    const openRouterChat = jest.fn(
      async (config: { model: string }) =>
        ({
          text: "here is a scholarship",
          toolCalls: [],
          provider: "openrouter",
          model: config.model,
        }) as AiChatResult,
    );
    const service = buildService(
      {
        generateChat: jest.fn(async () => {
          throw new Error("DeepSeek chat request failed: 503");
        }),
      },
      { generateChat: openRouterChat },
    );

    const result = await service.generateChat(CHAT_OPTIONS);

    expect(openRouterChat).toHaveBeenCalledTimes(1);
    // The fallback must carry a model the fallback provider actually knows —
    // "deepseek-chat" is not an OpenRouter model id.
    expect(openRouterChat.mock.calls[0][0].model).toContain("/");
    expect(result.text).toBe("here is a scholarship");
  });

  it("fails a JSON generation over to OpenRouter when DeepSeek is down", async () => {
    const openRouterText = jest.fn(
      async () =>
        ({
          text: '{"ok":true}',
          provider: "openrouter",
          model: "deepseek/deepseek-chat",
        }) as AiGenerateResult,
    );
    const service = buildService(
      {
        generateText: jest.fn(async () => {
          throw new Error("DeepSeek request failed: 500");
        }),
      },
      { generateText: openRouterText },
    );

    const result = await service.generateJson<{ ok: boolean }>({
      feature: "roadmaps.match",
      prompt: "match me",
    });

    expect(openRouterText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("continues JSON failover to OpenAI when DeepSeek and OpenRouter both fail", async () => {
    const openAiText = jest.fn(
      async () =>
        ({
          text: '{"ok":true}',
          provider: "openai",
          model: "gpt-4.1-mini",
        }) as AiGenerateResult,
    );
    const service = buildService(
      {
        generateText: jest.fn(async () => {
          throw new Error("DeepSeek request failed: 402");
        }),
      },
      {
        generateText: jest.fn(async () => {
          throw new Error("OpenRouter request failed: 401");
        }),
      },
      { generateText: openAiText },
    );

    await expect(
      service.generateJson<{ ok: boolean }>({
        feature: "opportunities.enhance",
        prompt: "complete this opportunity",
      }),
    ).resolves.toEqual({ ok: true });
  });

  // The guarantee A2b's `delivered` flag exists for: replaying a round whose
  // tokens the user already watched appear would show a second, different
  // answer stitched onto the first.
  it("never fails over a stream that already delivered tokens", async () => {
    const openRouterChat = jest.fn();
    const deepseekChat = jest.fn();
    const service = buildService(
      {
        generateChat: deepseekChat,
        generateChatStream: jest.fn(async (_config, options) => {
          options.onToken("Here is ");
          throw new Error("socket hang up");
        }),
      },
      { generateChat: openRouterChat },
    );

    const tokens: string[] = [];
    await expect(
      service.generateChatStream({
        ...CHAT_OPTIONS,
        onToken: (delta) => tokens.push(delta),
      }),
    ).rejects.toThrow("socket hang up");

    expect(tokens).toEqual(["Here is "]);
    expect(deepseekChat).not.toHaveBeenCalled();
    expect(openRouterChat).not.toHaveBeenCalled();
  });

  it("fails over when the stream dies before a single token reached the user", async () => {
    const openRouterChat = jest.fn(
      async () =>
        ({
          text: "buffered fallback answer",
          toolCalls: [],
          provider: "openrouter",
          model: "deepseek/deepseek-chat",
        }) as AiChatResult,
    );
    const service = buildService(
      {
        generateChat: jest.fn(async () => {
          throw new Error("DeepSeek chat request failed: 503");
        }),
        generateChatStream: jest.fn(async () => {
          throw new Error("DeepSeek chat stream request failed: 503");
        }),
      },
      { generateChat: openRouterChat },
    );

    const tokens: string[] = [];
    const result = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: (delta) => tokens.push(delta),
    });

    expect(tokens).toEqual([]);
    expect(result.text).toBe("buffered fallback answer");
  });

  it("does not fail over when no fallback provider has a key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const openRouterChat = jest.fn();
    const service = buildService(
      {
        generateChat: jest.fn(async () => {
          throw new Error("DeepSeek chat request failed: 503");
        }),
      },
      { generateChat: openRouterChat },
    );

    await expect(service.generateChat(CHAT_OPTIONS)).rejects.toThrow(
      "DeepSeek chat request failed: 503",
    );
    expect(openRouterChat).not.toHaveBeenCalled();
  });

  it("keeps embeddings pinned to their provider (no chat failover)", async () => {
    const openRouterEmbedding = jest.fn();
    const service = buildService({}, {
      generateEmbedding: openRouterEmbedding,
    } as any);

    const result = await service.embed({
      feature: "embeddings.query",
      input: "hello",
    });

    // Gemini has no adapter methods in this harness, so the call degrades to
    // null — it must never wander onto the chat fallback.
    expect(result).toBeNull();
    expect(openRouterEmbedding).not.toHaveBeenCalled();
  });

  it("streams a failed-over answer as a whole when the primary never streams", async () => {
    const openRouterStream = jest.fn();
    const service = buildService(
      {
        generateChat: jest.fn(async () => {
          throw new Error("DeepSeek chat request failed: 503");
        }),
        generateChatStream: jest.fn(async () => {
          throw new Error("DeepSeek chat stream request failed: 503");
        }),
      },
      {
        generateChat: jest.fn(
          async () =>
            ({
              text: "fallback",
              toolCalls: [],
              provider: "openrouter",
              model: "deepseek/deepseek-chat",
            }) as AiChatResult,
        ),
        generateChatStream: openRouterStream as any,
      },
    );

    const result: AiChatStreamResult = await service.generateChatStream({
      ...CHAT_OPTIONS,
      onToken: () => undefined,
    });

    // The fallback is deliberately taken through the BUFFERED call: a second
    // stream would reopen the duplicate-text risk for no user-visible gain.
    expect(openRouterStream).not.toHaveBeenCalled();
    expect(result.text).toBe("fallback");
  });
});
