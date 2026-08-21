import { AiService } from "./ai.service";
import type { AiEncryptionService } from "./ai-encryption.service";
import type { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import type { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import type { AiGenerateResult, AiRouteConfig } from "./ai.types";

jest.mock("../db", () => {
  const emptySelect: any = {
    from: () => emptySelect,
    where: () => emptySelect,
    orderBy: () => emptySelect,
    limit: () => emptySelect,
    execute: () => Promise.resolve([]),
  };
  const rows: Array<Record<string, any>> = [];
  (globalThis as Record<string, any>).__aiCostRows = rows;
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

const usageRows = (): Array<Record<string, any>> =>
  (globalThis as Record<string, any>).__aiCostRows;

function buildService(openRouter: Partial<OpenRouterAdapter>) {
  const encryption = {
    decrypt: (value: string) => value,
  } as unknown as AiEncryptionService;

  return new AiService(
    encryption,
    { provider: "deepseek" } as unknown as DeepSeekAdapter,
    { provider: "gemini" } as unknown as GeminiAdapter,
    {
      provider: "openrouter",
      ...openRouter,
    } as unknown as OpenRouterAdapter,
  );
}

describe("AiService — cost attribution", () => {
  const original = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    openrouterModel: process.env.OPENROUTER_MODEL,
  };

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.OPENROUTER_MODEL;
    usageRows().length = 0;
  });

  afterEach(() => {
    if (original.deepseek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original.deepseek;
    if (original.openrouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original.openrouter;
    if (original.openrouterModel === undefined)
      delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = original.openrouterModel;
  });

  it("does not record the paid OpenRouter fallback as zero cost", async () => {
    const service = buildService({
      generateText: async () =>
        ({
          text: "ok",
          provider: "openrouter",
          model: "deepseek/deepseek-chat",
          usage: {
            promptTokens: 1_000,
            completionTokens: 500,
            totalTokens: 1_500,
          },
        }) as AiGenerateResult,
    });

    await service.generateText({
      feature: "opportunities.rerank",
      prompt: "Rank these opportunities",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const event = usageRows().find((row) => "estimatedCostUsd" in row);
    expect(event).toBeDefined();
    expect(Number(event?.estimatedCostUsd)).toBeGreaterThan(0);
  });

  it("enforces compact output ceilings on structured high-volume features", async () => {
    let routeSeen: AiRouteConfig | undefined;
    const service = buildService({
      generateText: async (route) => {
        routeSeen = route;
        return {
          text: "{}",
          provider: "openrouter",
          model: "deepseek/deepseek-chat",
          usage: { totalTokens: 20 },
        } as AiGenerateResult;
      },
    });

    await service.generateText({
      feature: "opportunities.rerank",
      prompt: "Rank these opportunities",
      maxOutputTokens: 4_096,
    });

    expect(routeSeen?.maxOutputTokens).toBe(768);
  });
});
