import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  aiProviderKeys,
  aiRoutes,
  aiUsageEvents,
  aiUsageLogs,
} from "../db/schema";
import { AiEncryptionService } from "./ai-encryption.service";
import {
  AiEmbedOptions,
  AiEmbedResult,
  AiGenerateOptions,
  AiGenerateResult,
  AiProvider,
  AiProviderAdapter,
  AiRouteConfig,
} from "./ai.types";
import { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import { createHash } from "crypto";
import { TtlCache } from "../common/cache/ttl-cache";

function aiNumberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Server-side output-token ceiling applied when a route doesn't set one, so a
// large prompt can't run up an unbounded (and unbudgeted) completion.
const DEFAULT_MAX_OUTPUT_TOKENS = aiNumberEnv(
  process.env.AI_DEFAULT_MAX_OUTPUT_TOKENS,
  4096,
);
// Identical-prompt response cache: only used for deterministic (very low
// temperature) JSON generations, where the same input yields the same output.
const RESPONSE_CACHE_TTL_MS = aiNumberEnv(
  process.env.AI_RESPONSE_CACHE_TTL_MS,
  300_000,
);
const RESPONSE_CACHE_MAX_TEMPERATURE = 0.1;

// USD per 1M tokens, keyed by model. Edit here when pricing changes or a new
// model is routed. Unknown models are costed at $0 (tokens still recorded).
const MODEL_PRICES_PER_MILLION_TOKENS_USD: Record<
  string,
  { input: number; output: number }
> = {
  // DeepSeek chat (cache-miss input rate).
  "deepseek-chat": { input: 0.27, output: 1.1 },
  // Gemini embeddings (input only; embeddings have no completion tokens).
  "text-embedding-004": { input: 0.01, output: 0 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

function estimateCostUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
  totalTokens: number | null,
): number {
  const price = MODEL_PRICES_PER_MILLION_TOKENS_USD[model];
  if (!price) return 0;
  // When only a total is reported (e.g. embeddings), bill it as input tokens.
  const input =
    promptTokens ??
    (completionTokens === null && totalTokens !== null ? totalTokens : 0);
  const output = completionTokens ?? 0;
  return (input * price.input + output * price.output) / 1_000_000;
}

const DEFAULT_ROUTES: Record<
  string,
  Omit<AiRouteConfig, "feature" | "apiKey">
> = {
  "chat.coach": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    isEnabled: true,
  },
  "chat.transcribe": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    isEnabled: true,
  },
  "scraper.extract": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.05,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "opportunities.enhance": {
    provider: "deepseek",
    model: "deepseek-chat",
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "opportunities.extract": {
    provider: "deepseek",
    model: "deepseek-chat",
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "opportunities.rerank": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "cv.draft": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "cv.tailor": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "roadmaps.questions": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "roadmaps.intent_tags": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "roadmaps.match": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "roadmaps.opportunity_plan": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "quiz.generate": {
    provider: "deepseek",
    model: "deepseek-chat",
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "copilot.kit": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "copilot.outline": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  "copilot.feedback": {
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    responseMimeType: "application/json",
    isEnabled: true,
  },
  // Embeddings power semantic recommendation retrieval. DeepSeek has no
  // embeddings API, so these route to Gemini; the engine degrades to the
  // heuristic ranker when the key/route is unavailable (embed() -> null).
  "embeddings.opportunity": {
    provider: "gemini",
    model: "text-embedding-004",
    isEnabled: true,
  },
  "embeddings.profile": {
    provider: "gemini",
    model: "text-embedding-004",
    isEnabled: true,
  },
  "embeddings.query": {
    provider: "gemini",
    model: "text-embedding-004",
    isEnabled: true,
  },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly adapters = new Map<AiProvider, AiProviderAdapter>();
  private readonly responseCache = new TtlCache<AiGenerateResult>(
    RESPONSE_CACHE_TTL_MS,
    200,
  );

  constructor(
    private readonly encryption: AiEncryptionService,
    deepseek: DeepSeekAdapter,
    gemini: GeminiAdapter,
    openRouter: OpenRouterAdapter,
  ) {
    this.adapters.set(deepseek.provider, deepseek);
    this.adapters.set(gemini.provider, gemini);
    this.adapters.set(openRouter.provider, openRouter);
  }

  async generateText(options: AiGenerateOptions): Promise<AiGenerateResult> {
    const startedAt = Date.now();
    const route = await this.resolveRoute(options);
    const adapter = this.adapters.get(route.provider);

    if (!route.isEnabled) {
      throw new Error(`AI feature ${options.feature} is disabled`);
    }

    if (!adapter) {
      throw new Error(`AI provider ${route.provider} is not supported yet`);
    }

    // Identical-prompt cache for deterministic JSON routes (see cacheKeyFor).
    const cacheKey = this.responseCacheKey(route, options);
    if (cacheKey) {
      const cached = this.responseCache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const result = await adapter.generateText(route, options);
      // Fire-and-forget: don't block the response on the usage-log write
      // (logUsage swallows its own errors).
      void this.logUsage(options, route, result, Date.now() - startedAt);
      if (cacheKey) this.responseCache.set(cacheKey, result);
      return result;
    } catch (error) {
      void this.logUsage(options, route, null, Date.now() - startedAt, error);

      // A provider outage should not take down the feature if a fallback
      // provider is configured. Retry once on the secondary before giving up.
      const fallbackRoute = await this.resolveFallbackRoute(route);
      if (fallbackRoute) {
        const fallbackAdapter = this.adapters.get(fallbackRoute.provider);
        if (fallbackAdapter) {
          this.logger.warn(
            `AI feature ${options.feature} failed on ${route.provider}; failing over to ${fallbackRoute.provider}`,
          );
          const fallbackStartedAt = Date.now();
          try {
            const result = await fallbackAdapter.generateText(
              fallbackRoute,
              options,
            );
            void this.logUsage(
              options,
              fallbackRoute,
              result,
              Date.now() - fallbackStartedAt,
            );
            if (cacheKey) this.responseCache.set(cacheKey, result);
            return result;
          } catch (fallbackError) {
            void this.logUsage(
              options,
              fallbackRoute,
              null,
              Date.now() - fallbackStartedAt,
              fallbackError,
            );
          }
        }
      }

      throw error;
    }
  }

  /**
   * Generates embeddings for one or many texts via the routed provider.
   *
   * Graceful-degradation contract: returns `null` — never throws — when the
   * route is disabled, the provider has no embeddings support (e.g. DeepSeek),
   * the API key is missing, or the request fails. Callers must treat `null`
   * as "semantic signal unavailable" and fall back to heuristics.
   */
  async embed(options: AiEmbedOptions): Promise<AiEmbedResult | null> {
    const startedAt = Date.now();
    let route: AiRouteConfig;
    try {
      route = await this.resolveRoute({ feature: options.feature, prompt: "" });
    } catch (error) {
      this.logger.warn(
        `Embedding route resolution failed for ${options.feature}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    // resolveRoute's generic model fallback prefers the provider default chat
    // model (e.g. gemini-2.0-flash); embeddings need an embedding model. Only
    // honor the resolved model when it plausibly is one; otherwise pin the
    // feature's default. Admins can still override via ai_routes with a real
    // embedding model.
    if (!/embedding/i.test(route.model)) {
      route = {
        ...route,
        model: DEFAULT_ROUTES[options.feature]?.model || "text-embedding-004",
      };
    }

    if (!route.isEnabled) {
      this.logger.warn(`Embedding feature ${options.feature} is disabled`);
      return null;
    }

    const adapter = this.adapters.get(route.provider);
    if (!adapter?.generateEmbedding) {
      this.logger.warn(
        `Provider ${route.provider} has no embeddings support (feature ${options.feature})`,
      );
      return null;
    }

    if (!route.apiKey) {
      this.logger.warn(
        `No API key for embeddings provider ${route.provider} (feature ${options.feature}) — semantic scoring degraded`,
      );
      return null;
    }

    const logOptions: AiGenerateOptions = {
      feature: options.feature,
      prompt: "",
      metadata: options.metadata,
    };

    try {
      const result = await adapter.generateEmbedding(route, {
        dimensions: 768,
        ...options,
      });
      void this.logUsage(
        logOptions,
        route,
        {
          text: "",
          provider: result.provider,
          model: result.model,
          usage: { totalTokens: result.usage?.totalTokens },
        },
        Date.now() - startedAt,
      );
      return result;
    } catch (error) {
      void this.logUsage(logOptions, route, null, Date.now() - startedAt, error);
      this.logger.warn(
        `Embedding request failed for ${options.feature}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  // Returns a cache key only for deterministic generations — very low
  // temperature AND JSON output — where an identical prompt reliably yields an
  // identical result. Creative/chat routes (higher temperature, prose) are
  // never cached. The key covers everything that can change the output.
  private responseCacheKey(
    route: AiRouteConfig,
    options: AiGenerateOptions,
  ): string | null {
    const temperature =
      typeof options.temperature === "number"
        ? options.temperature
        : (route.temperature ?? null);
    const isJson =
      route.responseMimeType === "application/json" ||
      options.responseMimeType === "application/json";

    if (!isJson || temperature === null) return null;
    if (temperature > RESPONSE_CACHE_MAX_TEMPERATURE) return null;

    const material = JSON.stringify({
      feature: options.feature,
      provider: route.provider,
      model: route.model,
      systemPrompt: route.systemPrompt ?? options.systemInstruction ?? null,
      temperature,
      maxOutputTokens: route.maxOutputTokens ?? null,
      responseMimeType: route.responseMimeType ?? options.responseMimeType,
      prompt: options.prompt,
    });
    return createHash("sha256").update(material).digest("hex");
  }

  async generateJson<T = unknown>(
    options: AiGenerateOptions,
  ): Promise<T | null> {
    const result = await this.generateText({
      ...options,
      responseMimeType: options.responseMimeType || "application/json",
    });

    if (!result.text) return null;
    return JSON.parse(this.normalizeJson(result.text)) as T;
  }

  async listConfig() {
    const [routes, keys] = await Promise.all([
      db.select().from(aiRoutes).orderBy(aiRoutes.feature).execute(),
      db
        .select({
          id: aiProviderKeys.id,
          provider: aiProviderKeys.provider,
          label: aiProviderKeys.label,
          keyPreview: aiProviderKeys.keyPreview,
          isActive: aiProviderKeys.isActive,
          createdAt: aiProviderKeys.createdAt,
          updatedAt: aiProviderKeys.updatedAt,
        })
        .from(aiProviderKeys)
        .orderBy(desc(aiProviderKeys.createdAt))
        .execute(),
    ]);

    return { routes, providerKeys: keys, defaults: DEFAULT_ROUTES };
  }

  async saveProviderKey(input: {
    provider: string;
    label: string;
    apiKey: string;
    createdBy?: string | null;
  }) {
    const encryptedKey = this.encryption.encrypt(input.apiKey.trim());
    const [saved] = await db
      .insert(aiProviderKeys)
      .values({
        provider: input.provider.trim().toLowerCase(),
        label: input.label.trim(),
        encryptedKey,
        keyPreview: this.encryption.preview(input.apiKey),
        createdBy: input.createdBy || null,
        isActive: true,
      })
      .returning({
        id: aiProviderKeys.id,
        provider: aiProviderKeys.provider,
        label: aiProviderKeys.label,
        keyPreview: aiProviderKeys.keyPreview,
        isActive: aiProviderKeys.isActive,
      })
      .execute();

    return saved;
  }

  async upsertRoute(input: {
    feature: string;
    provider: string;
    model: string;
    providerKeyId?: string | null;
    systemPrompt?: string | null;
    temperature?: number | null;
    maxOutputTokens?: number | null;
    responseMimeType?: string | null;
    fallbackProvider?: string | null;
    fallbackModel?: string | null;
    isEnabled?: boolean;
    metadata?: Record<string, unknown>;
    updatedBy?: string | null;
  }) {
    const temperature = this.toStoredTemperature(input.temperature);
    const values = {
      feature: input.feature.trim(),
      provider: input.provider.trim().toLowerCase(),
      model: input.model.trim(),
      providerKeyId: input.providerKeyId || null,
      systemPrompt: input.systemPrompt || null,
      temperature,
      maxOutputTokens: input.maxOutputTokens || null,
      responseMimeType: input.responseMimeType || null,
      fallbackProvider: input.fallbackProvider || null,
      fallbackModel: input.fallbackModel || null,
      isEnabled: input.isEnabled ?? true,
      metadata: input.metadata || {},
      updatedBy: input.updatedBy || null,
      updatedAt: new Date(),
    };

    const [saved] = await db
      .insert(aiRoutes)
      .values(values)
      .onConflictDoUpdate({
        target: aiRoutes.feature,
        set: values,
      })
      .returning()
      .execute();

    return saved;
  }

  private async resolveRoute(
    options: AiGenerateOptions,
  ): Promise<AiRouteConfig> {
    // The ai_routes table is an admin override, not a dependency: when the
    // control-plane DB is unreachable, fall back to the built-in defaults and
    // env API keys instead of failing every AI feature.
    let storedRoute: typeof aiRoutes.$inferSelect | undefined;
    try {
      [storedRoute] = await db
        .select()
        .from(aiRoutes)
        .where(eq(aiRoutes.feature, options.feature))
        .limit(1)
        .execute();
    } catch (error) {
      this.logger.warn(
        `ai_routes lookup failed for "${options.feature}" — using env defaults: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    const fallback = DEFAULT_ROUTES[options.feature] || {
      provider: "deepseek",
      model: "deepseek-chat",
      isEnabled: true,
    };

    const provider = this.normalizeProvider(
      storedRoute?.provider || fallback.provider,
    );
    let providerKey: string | null = null;
    try {
      providerKey = storedRoute?.providerKeyId
        ? await this.getKeyById(storedRoute.providerKeyId)
        : await this.getLatestKey(provider);
    } catch {
      // Stored keys unavailable — getEnvKey below still supplies the key.
      providerKey = null;
    }

    return {
      feature: options.feature,
      provider,
      model:
        storedRoute?.model || this.getDefaultModel(provider) || fallback.model,
      apiKey: providerKey || this.getEnvKey(provider),
      systemPrompt:
        storedRoute?.systemPrompt ||
        fallback.systemPrompt ||
        options.systemInstruction ||
        null,
      temperature:
        typeof options.temperature === "number"
          ? options.temperature
          : (this.fromStoredTemperature(storedRoute?.temperature) ??
            fallback.temperature ??
            null),
      maxOutputTokens:
        options.maxOutputTokens ||
        storedRoute?.maxOutputTokens ||
        fallback.maxOutputTokens ||
        DEFAULT_MAX_OUTPUT_TOKENS,
      responseMimeType:
        options.responseMimeType ||
        storedRoute?.responseMimeType ||
        fallback.responseMimeType ||
        null,
      fallbackProvider: storedRoute?.fallbackProvider
        ? this.normalizeProvider(storedRoute.fallbackProvider)
        : null,
      fallbackModel: storedRoute?.fallbackModel || null,
      isEnabled: storedRoute?.isEnabled ?? fallback.isEnabled,
    };
  }

  /**
   * Builds a route for the configured fallback provider, or null when there is
   * no usable fallback (none configured, same provider, or no API key). Used to
   * survive a single provider outage without taking down every AI feature.
   */
  private async resolveFallbackRoute(
    primary: AiRouteConfig,
  ): Promise<AiRouteConfig | null> {
    if (!primary.fallbackProvider) return null;

    const provider = this.normalizeProvider(primary.fallbackProvider);
    if (!provider || provider === primary.provider) return null;
    if (!this.adapters.has(provider)) return null;

    const apiKey =
      (await this.getLatestKey(provider)) || this.getEnvKey(provider);
    if (!apiKey) return null;

    return {
      ...primary,
      provider,
      model:
        primary.fallbackModel ||
        this.getDefaultModel(provider) ||
        primary.model,
      apiKey,
      // Prevent a fallback from chaining into another fallback.
      fallbackProvider: null,
      fallbackModel: null,
    };
  }

  private async getKeyById(id: string) {
    const [key] = await db
      .select()
      .from(aiProviderKeys)
      .where(and(eq(aiProviderKeys.id, id), eq(aiProviderKeys.isActive, true)))
      .limit(1)
      .execute();

    return key ? this.encryption.decrypt(key.encryptedKey) : null;
  }

  private async getLatestKey(provider: string) {
    const normalizedProvider = this.normalizeProvider(provider);

    const [key] = await db
      .select()
      .from(aiProviderKeys)
      .where(
        and(
          eq(aiProviderKeys.provider, normalizedProvider),
          eq(aiProviderKeys.isActive, true),
        ),
      )
      .orderBy(desc(aiProviderKeys.createdAt))
      .limit(1)
      .execute();

    if (key) {
      return this.encryption.decrypt(key.encryptedKey);
    }

    return null;
  }

  private getEnvKey(provider: string) {
    const normalizedProvider = this.normalizeProvider(provider);

    if (normalizedProvider === "openrouter")
      return process.env.OPENROUTER_API_KEY || null;
    if (normalizedProvider === "deepseek")
      return process.env.DEEPSEEK_API_KEY || null;
    if (normalizedProvider === "gemini")
      return process.env.GEMINI_API_KEY || null;
    if (normalizedProvider === "openai")
      return process.env.OPENAI_API_KEY || null;
    if (normalizedProvider === "groq") return process.env.GROQ_API_KEY || null;
    return null;
  }

  private getDefaultModel(provider: string) {
    const normalizedProvider = this.normalizeProvider(provider);

    if (normalizedProvider === "deepseek") return "deepseek-chat";
    if (normalizedProvider === "gemini") return "gemini-2.0-flash";
    return null;
  }

  private normalizeProvider(provider: string) {
    return (provider || "").toLowerCase();
  }

  private toStoredTemperature(value: number | null | undefined) {
    if (typeof value !== "number") return 20;
    return Math.round(Math.max(0, Math.min(2, value)) * 100);
  }

  private fromStoredTemperature(value: number | null | undefined) {
    if (typeof value !== "number") return null;
    return value / 100;
  }

  private normalizeJson(text: string) {
    return text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }

  private async logUsage(
    options: AiGenerateOptions,
    route: AiRouteConfig,
    result: AiGenerateResult | null,
    latencyMs: number,
    error?: unknown,
  ) {
    try {
      await db.insert(aiUsageLogs).values({
        feature: options.feature,
        provider: route.provider,
        model: route.model,
        status: error ? "error" : "success",
        latencyMs,
        promptTokens: result?.usage?.promptTokens ?? null,
        completionTokens: result?.usage?.completionTokens ?? null,
        totalTokens: result?.usage?.totalTokens ?? null,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 1000) : null,
        requestMetadata: options.metadata || {},
      });
    } catch (logError) {
      this.logger.warn(
        `Failed to write AI usage log: ${logError instanceof Error ? logError.message : String(logError)}`,
      );
    }

    // Cost-tracking event (ai_usage_events). Separately guarded so a missing
    // table (migration not applied yet) never affects the legacy log above —
    // and neither write can ever fail the AI call itself.
    try {
      const promptTokens = result?.usage?.promptTokens ?? null;
      const completionTokens = result?.usage?.completionTokens ?? null;
      const totalTokens = result?.usage?.totalTokens ?? null;
      await db.insert(aiUsageEvents).values({
        provider: route.provider,
        model: route.model,
        route: options.feature,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(
          route.model,
          promptTokens,
          completionTokens,
          totalTokens,
        ).toFixed(8),
        latencyMs,
        success: !error,
        error: error instanceof Error ? error.message.slice(0, 1000) : null,
      });
    } catch (eventError) {
      this.logger.warn(
        `Failed to write AI usage event: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
      );
    }
  }
}
