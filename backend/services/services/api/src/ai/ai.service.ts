import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { aiProviderKeys, aiRoutes, aiUsageLogs } from "../db/schema";
import { AiEncryptionService } from "./ai-encryption.service";
import {
  AiGenerateOptions,
  AiGenerateResult,
  AiProvider,
  AiProviderAdapter,
  AiRouteConfig,
} from "./ai.types";
import { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import { OpenRouterAdapter } from "./adapters/openrouter.adapter";

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
  "quiz.generate": {
    provider: "deepseek",
    model: "deepseek-chat",
    responseMimeType: "application/json",
    isEnabled: true,
  },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly adapters = new Map<AiProvider, AiProviderAdapter>();

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

    try {
      const result = await adapter.generateText(route, options);
      await this.logUsage(options, route, result, Date.now() - startedAt);
      return result;
    } catch (error) {
      await this.logUsage(options, route, null, Date.now() - startedAt, error);
      throw error;
    }
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
    const [storedRoute] = await db
      .select()
      .from(aiRoutes)
      .where(eq(aiRoutes.feature, options.feature))
      .limit(1)
      .execute();

    const fallback = DEFAULT_ROUTES[options.feature] || {
      provider: "deepseek",
      model: "deepseek-chat",
      isEnabled: true,
    };

    const provider = this.normalizeProvider(
      storedRoute?.provider || fallback.provider,
    );
    const providerKey = storedRoute?.providerKeyId
      ? await this.getKeyById(storedRoute.providerKeyId)
      : await this.getLatestKey(provider);

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
        null,
      responseMimeType:
        options.responseMimeType ||
        storedRoute?.responseMimeType ||
        fallback.responseMimeType ||
        null,
      isEnabled: storedRoute?.isEnabled ?? fallback.isEnabled,
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
  }
}
