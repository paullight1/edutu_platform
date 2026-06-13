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
  | "cv.draft"
  | "cv.tailor"
  | "roadmaps.questions"
  | "roadmaps.intent_tags"
  | "roadmaps.match"
  | "quiz.generate"
  | string;

export interface AiGenerateOptions {
  feature: AiFeature;
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

export interface AiProviderAdapter {
  readonly provider: AiProvider;
  generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult>;
}
