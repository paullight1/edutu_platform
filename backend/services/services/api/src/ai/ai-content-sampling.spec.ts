import { AiService } from "./ai.service";
import type { AiEncryptionService } from "./ai-encryption.service";
import type { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import type { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import type { AiChatResult, AiGenerateResult } from "./ai.types";

jest.mock("../db", () => {
  const emptySelect: any = {
    from: () => emptySelect,
    where: () => emptySelect,
    orderBy: () => emptySelect,
    limit: () => emptySelect,
    execute: () => Promise.resolve([]),
  };
  const rows: Array<Record<string, any>> = [];
  (globalThis as Record<string, any>).__sampleRows = rows;
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
  (globalThis as Record<string, any>).__sampleRows;

/** The ai_usage_logs row (the events row has no requestMetadata). */
const usageLog = () => usageRows().find((row) => "requestMetadata" in row)!;

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

describe("AiService — sampled content logging", () => {
  const original = {
    key: process.env.DEEPSEEK_API_KEY,
    rate: process.env.AI_CONTENT_SAMPLE_RATE,
  };

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    usageRows().length = 0;
  });

  afterEach(() => {
    if (original.key === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original.key;
    if (original.rate === undefined) delete process.env.AI_CONTENT_SAMPLE_RATE;
    else process.env.AI_CONTENT_SAMPLE_RATE = original.rate;
    jest.restoreAllMocks();
  });

  it("persists prompt and response on a sampled generation", async () => {
    process.env.AI_CONTENT_SAMPLE_RATE = "1";
    const service = buildService({
      generateText: async () =>
        ({
          text: "Try the Mastercard Foundation Scholars Program.",
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiGenerateResult,
    });

    await service.generateText({
      feature: "chat.coach",
      prompt: "Which scholarship suits a Ghanaian CS student?",
    });

    expect(usageLog().requestMetadata.sampledContent).toMatchObject({
      prompt: "Which scholarship suits a Ghanaian CS student?",
      response: "Try the Mastercard Foundation Scholars Program.",
    });
  });

  it("samples chat turns with their real messages, not the placeholder summary", async () => {
    process.env.AI_CONTENT_SAMPLE_RATE = "1";
    const service = buildService({
      generateChat: async () =>
        ({
          text: "Here are two that fit.",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiChatResult,
    });

    await service.generateChat({
      feature: "chat.agent",
      messages: [{ role: "user", content: "any fellowships in Kenya?" }],
    });

    const sampled = usageLog().requestMetadata.sampledContent;
    expect(sampled.prompt).toContain("any fellowships in Kenya?");
    expect(sampled.response).toBe("Here are two that fit.");
  });

  it("logs no content at all when sampling is switched off", async () => {
    process.env.AI_CONTENT_SAMPLE_RATE = "0";
    const service = buildService({
      generateText: async () =>
        ({
          text: "answer",
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiGenerateResult,
    });

    await service.generateText({
      feature: "chat.coach",
      prompt: "a prompt full of personal details",
    });

    expect(usageLog().requestMetadata).not.toHaveProperty("sampledContent");
  });

  // Owner decision: prompts carry personal data (chat, but also verbatim CV
  // text via cv.draft / docs.sop), ai_usage_logs has no purge job, and rows are
  // joined to user_id — so the SAFE state must not depend on an env var being
  // remembered at deploy time. The code default is 0: sampling is opt-in.
  // Math.random() is pinned to 0, the lowest possible draw, so ANY non-zero
  // default would sample and fail this test.
  it("defaults to sampling switched off", async () => {
    delete process.env.AI_CONTENT_SAMPLE_RATE;
    jest.spyOn(Math, "random").mockReturnValue(0);
    const service = buildService({
      generateText: async () =>
        ({
          text: "answer",
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiGenerateResult,
    });

    await service.generateText({ feature: "chat.coach", prompt: "hello" });

    expect(usageLog().requestMetadata).not.toHaveProperty("sampledContent");
  });

  it("caps how much content a sampled row can store", async () => {
    process.env.AI_CONTENT_SAMPLE_RATE = "1";
    const service = buildService({
      generateText: async () =>
        ({
          text: "b".repeat(50_000),
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiGenerateResult,
    });

    await service.generateText({
      feature: "chat.coach",
      prompt: "a".repeat(50_000),
    });

    const sampled = usageLog().requestMetadata.sampledContent;
    expect(sampled.prompt.length).toBeLessThanOrEqual(2000);
    expect(sampled.response.length).toBeLessThanOrEqual(2000);
    expect(sampled.truncated).toBe(true);
  });

  it("keeps the turn id on the row so one turn's calls can be joined", async () => {
    process.env.AI_CONTENT_SAMPLE_RATE = "0";
    const service = buildService({
      generateChat: async () =>
        ({
          text: "ok",
          toolCalls: [],
          provider: "deepseek",
          model: "deepseek-chat",
        }) as AiChatResult,
    });

    await service.generateChat({
      feature: "chat.agent",
      messages: [{ role: "user", content: "hi" }],
      metadata: { source: "chat-agent", round: 0, turnId: "turn-1" },
    });

    expect(usageLog().requestMetadata).toMatchObject({ turnId: "turn-1" });
  });
});
