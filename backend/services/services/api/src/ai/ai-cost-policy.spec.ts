import {
  estimateAiCostUsd,
  getAiFeatureOutputTokenLimit,
} from "./ai-cost-policy";

describe("AI cost policy", () => {
  it("prices provider-native DeepSeek usage", () => {
    expect(
      estimateAiCostUsd({
        provider: "deepseek",
        model: "deepseek-chat",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      }),
    ).toBeCloseTo(1.37, 8);
  });

  it("prices the namespaced OpenRouter DeepSeek fallback instead of recording zero", () => {
    const cost = estimateAiCostUsd({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      promptTokens: 1_000,
      completionTokens: 500,
      totalTokens: 1_500,
    });

    expect(cost).not.toBeNull();
    expect(cost).toBeGreaterThan(0);
  });

  it("returns null for an unpriced model instead of claiming it is free", () => {
    expect(
      estimateAiCostUsd({
        provider: "openrouter",
        model: "unknown/model",
        promptTokens: 1_000,
        completionTokens: 500,
        totalTokens: 1_500,
      }),
    ).toBeNull();
  });

  it("bills total-only embedding usage as input tokens", () => {
    expect(
      estimateAiCostUsd({
        provider: "gemini",
        model: "text-embedding-004",
        promptTokens: null,
        completionTokens: null,
        totalTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.01, 8);
  });

  it("gives compact structured opportunity reranking a smaller output budget", () => {
    expect(getAiFeatureOutputTokenLimit("opportunities.rerank")).toBe(768);
    expect(getAiFeatureOutputTokenLimit("scraper.extract")).toBe(2048);
    expect(getAiFeatureOutputTokenLimit("unknown.feature")).toBeNull();
  });
});
