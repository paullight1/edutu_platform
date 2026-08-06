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
  | "opportunities.share_enrich"
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

// ─── Multi-turn chat with tool calling ────────────────────────────────────────

export type AiChatRole = "system" | "user" | "assistant" | "tool";

export interface AiToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments exactly as the model produced them. */
  arguments: string;
}

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
  /** Present on assistant messages that requested tool invocations. */
  toolCalls?: AiToolCall[];
  /** Present on role:"tool" messages — the call this result answers. */
  toolCallId?: string;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface AiChatOptions {
  feature: AiFeature;
  userId?: string | null;
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number | null;
  maxOutputTokens?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AiChatResult {
  text: string;
  /** Empty when the model answered directly instead of calling tools. */
  toolCalls: AiToolCall[];
  provider: AiProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AiChatStreamOptions extends AiChatOptions {
  /**
   * Invoked with each content delta as it arrives. Every agent round streams,
   * including tools-enabled ones: the model's `tool_calls` deltas are
   * reassembled separately and never reach this sink, so a delta is always
   * user-facing prose. A round that decides to call tools typically emits none.
   */
  onToken: (delta: string) => void;
}

export interface AiChatStreamResult extends AiChatResult {
  /**
   * True when the stream ended before the provider signalled completion
   * (`[DONE]` / a finish_reason). `text` still holds everything that was
   * received and already handed to `onToken`.
   */
  truncated?: boolean;
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
  /**
   * Optional: multi-turn chat with function/tool calling. AiService
   * .generateChat() reroutes to a capable provider when the routed adapter
   * lacks this.
   */
  generateChat?(
    config: AiRouteConfig,
    options: AiChatOptions,
  ): Promise<AiChatResult>;
  /**
   * Optional: token-streaming variant of generateChat for the final answer.
   * AiService.generateChatStream() falls back to the buffered generateChat when
   * the routed adapter lacks this (or when the stream fails to establish).
   */
  generateChatStream?(
    config: AiRouteConfig,
    options: AiChatStreamOptions,
  ): Promise<AiChatStreamResult>;
}
