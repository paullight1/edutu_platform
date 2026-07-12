export type AiProvider =
  | "deepseek"
  | "gemini"
  | "openrouter"
  | "openai"
  | "groq"
  | string;

export type AiFeature =
  | "chat.coach"
  | "chat.transcribe"
  | "scraper.extract"
  | "opportunities.enhance"
  | "opportunities.extract"
  | "opportunities.rerank"
  | "embeddings.opportunity"
  | "embeddings.profile"
  | "embeddings.query"
  | "cv.draft"
  | "cv.tailor"
  | "roadmaps.questions"
  | "roadmaps.intent_tags"
  | "roadmaps.match"
  | "quiz.generate"
  | string;

export interface AiGenerateOptions {
  feature: AiFeature;
  // End user this call is billed/attributed to (per-user cost analytics).
  userId?: string | null;
  prompt: string;
  systemInstruction?: string | null;
  responseMimeType?: string | null;
  responseJsonSchema?: Record<string, unknown> | null;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AiRouteConfig {
  feature: AiFeature;
  provider: AiProvider;
  model: string;
  apiKey?: string | null;
  systemPrompt?: string | null;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  responseMimeType?: string | null;
  responseJsonSchema?: Record<string, unknown> | null;
  fallbackProvider?: AiProvider | null;
  fallbackModel?: string | null;
  isEnabled: boolean;
}

export interface AiGenerateResult {
  text: string;
  provider: AiProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AiEmbedOptions {
  feature: AiFeature;
  /** One text or a batch; result order matches input order. */
  input: string | string[];
  /** Gemini task-type hint: documents for the corpus, queries for lookups. */
  taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  /** Output dimensionality; must match the DB vector column (default 768). */
  dimensions?: number;
  metadata?: Record<string, unknown>;
}

export interface AiEmbedResult {
  embeddings: number[][];
  provider: AiProvider;
  model: string;
  usage?: {
    totalTokens?: number;
  };
}

export interface AiProviderAdapter {
  readonly provider: AiProvider;
  generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult>;
  /**
   * Optional: not every provider offers embeddings (DeepSeek does not).
   * AiService.embed() degrades to null when the routed adapter lacks this.
   */
  generateEmbedding?(
    config: AiRouteConfig,
    options: AiEmbedOptions,
  ): Promise<AiEmbedResult>;
}
