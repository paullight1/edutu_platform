export type AiCostEstimateInput = {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

type AiModelPrice = {
  input: number;
  output: number;
};

const MODEL_PRICES_PER_MILLION_TOKENS_USD: Readonly<
  Record<string, AiModelPrice>
> = {
  "deepseek:deepseek-chat": { input: 0.27, output: 1.1 },
  "openrouter:deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
  "gemini:text-embedding-004": { input: 0.01, output: 0 },
  "gemini:gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

const FEATURE_OUTPUT_TOKEN_LIMITS: Readonly<Record<string, number>> = {
  "opportunities.rerank": 768,
  "scraper.extract": 2048,
};

function pricingKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

function safeTokenCount(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

/**
 * Returns an estimated USD cost for a configured provider/model pair.
 * `null` deliberately means "unpriced"; callers must never turn that into $0.
 */
export function estimateAiCostUsd({
  provider,
  model,
  promptTokens,
  completionTokens,
  totalTokens,
}: AiCostEstimateInput): number | null {
  const price =
    MODEL_PRICES_PER_MILLION_TOKENS_USD[pricingKey(provider, model)];
  if (!price) return null;

  const prompt = safeTokenCount(promptTokens);
  const completion = safeTokenCount(completionTokens);
  const total = safeTokenCount(totalTokens);
  const input = prompt ?? (completion === null && total !== null ? total : 0);
  const output = completion ?? 0;

  return (input * price.input + output * price.output) / 1_000_000;
}

/**
 * Small structured tasks get explicit ceilings instead of inheriting the
 * generic service-level completion budget. Unknown features keep their route
 * or global policy unchanged.
 */
export function getAiFeatureOutputTokenLimit(feature: string): number | null {
  return FEATURE_OUTPUT_TOKEN_LIMITS[feature] ?? null;
}
