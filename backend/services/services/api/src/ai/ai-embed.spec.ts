import { AiService } from "./ai.service";
import { GeminiAdapter, DeepSeekAdapter } from "./adapters/gemini.adapter";
import { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import { aiFetch } from "./adapters/ai-http";
import type { AiEncryptionService } from "./ai-encryption.service";
import type { AiRouteConfig } from "./ai.types";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            execute: jest.fn().mockResolvedValue([]),
          })),
          orderBy: jest.fn(() => ({
            limit: jest.fn(() => ({
              execute: jest.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

jest.mock("./adapters/ai-http", () => ({
  aiFetch: jest.fn(),
}));

const mockedAiFetch = aiFetch as jest.Mock;

const encryption = {
  decrypt: jest.fn(),
  encrypt: jest.fn(),
} as unknown as AiEncryptionService;

function buildService() {
  return new AiService(
    encryption,
    new DeepSeekAdapter(),
    new GeminiAdapter(),
    new OpenRouterAdapter(),
  );
}

function geminiEmbedResponse(count: number) {
  return {
    ok: true,
    json: async () => ({
      embeddings: Array.from({ length: count }, (_, i) => ({
        values: [i, i + 0.5, i + 0.25],
      })),
    }),
  };
}

describe("AiService.embed", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  it("routes embeddings.* features to gemini with an embedding model", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockedAiFetch.mockResolvedValue(geminiEmbedResponse(1));

    const service = buildService();
    const result = await service.embed({
      feature: "embeddings.opportunity",
      input: "Scholarship for engineers",
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("gemini");
    expect(result?.model).toBe("text-embedding-004");
    expect(result?.embeddings).toHaveLength(1);

    const [url, init] = mockedAiFetch.mock.calls[0];
    expect(url).toContain("text-embedding-004:batchEmbedContents");
    const body = JSON.parse(init.body);
    expect(body.requests).toHaveLength(1);
  });

  it("returns null (not throw) when the provider API key is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const service = buildService();
    const result = await service.embed({
      feature: "embeddings.profile",
      input: "student profile text",
    });

    expect(result).toBeNull();
    expect(mockedAiFetch).not.toHaveBeenCalled();
  });

  it("returns null when the routed provider has no embeddings support", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const service = buildService();
    // Force a deepseek route through a feature with no embeddings default.
    const result = await service.embed({
      feature: "chat.coach",
      input: "text",
    });

    // chat.coach resolves to deepseek, whose adapter lacks generateEmbedding —
    // but first the model guard pins text-embedding-004; provider stays
    // deepseek, so the adapter check must return null.
    expect(result).toBeNull();
    expect(mockedAiFetch).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when the request fails", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockedAiFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const service = buildService();
    const result = await service.embed({
      feature: "embeddings.query",
      input: "query text",
    });

    expect(result).toBeNull();
  });
});

describe("GeminiAdapter.generateEmbedding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const config: AiRouteConfig = {
    feature: "embeddings.opportunity",
    provider: "gemini",
    model: "text-embedding-004",
    apiKey: "test-key",
    isEnabled: true,
  };

  it("chunks batches above the 100-input Gemini limit", async () => {
    mockedAiFetch
      .mockResolvedValueOnce(geminiEmbedResponse(100))
      .mockResolvedValueOnce(geminiEmbedResponse(30));

    const adapter = new GeminiAdapter();
    const inputs = Array.from({ length: 130 }, (_, i) => `text ${i}`);
    const result = await adapter.generateEmbedding(config, {
      feature: "embeddings.opportunity",
      input: inputs,
      taskType: "RETRIEVAL_DOCUMENT",
      dimensions: 768,
    });

    expect(mockedAiFetch).toHaveBeenCalledTimes(2);
    expect(result.embeddings).toHaveLength(130);

    const firstBody = JSON.parse(mockedAiFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockedAiFetch.mock.calls[1][1].body);
    expect(firstBody.requests).toHaveLength(100);
    expect(secondBody.requests).toHaveLength(30);
    expect(firstBody.requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(firstBody.requests[0].outputDimensionality).toBe(768);
  });

  it("throws on a count mismatch so callers never mis-align vectors", async () => {
    mockedAiFetch.mockResolvedValue(geminiEmbedResponse(1));

    const adapter = new GeminiAdapter();
    await expect(
      adapter.generateEmbedding(config, {
        feature: "embeddings.opportunity",
        input: ["a", "b"],
      }),
    ).rejects.toThrow(/count mismatch/);
  });

  it("returns empty result for empty input without calling the API", async () => {
    const adapter = new GeminiAdapter();
    const result = await adapter.generateEmbedding(config, {
      feature: "embeddings.opportunity",
      input: [],
    });

    expect(result.embeddings).toEqual([]);
    expect(mockedAiFetch).not.toHaveBeenCalled();
  });
});
