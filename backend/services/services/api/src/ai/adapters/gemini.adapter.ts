import { Injectable } from "@nestjs/common";
import {
  AiChatOptions,
  AiChatResult,
  AiChatStreamOptions,
  AiChatStreamResult,
  AiEmbedOptions,
  AiEmbedResult,
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from "../ai.types";
import { aiFetch } from "./ai-http";
import {
  buildOpenAiChatBody,
  parseOpenAiChatResponse,
  requestOpenAiChatStream,
} from "./openai-compat";

// Gemini batchEmbedContents accepts at most 100 inputs per request.
const GEMINI_EMBED_BATCH_LIMIT = 100;

const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const GEMINI_API_URL_BASE =
  process.env.GEMINI_API_URL_BASE ||
  "https://generativelanguage.googleapis.com/v1beta";

@Injectable()
export class DeepSeekAdapter implements AiProviderAdapter {
  readonly provider = "deepseek";

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured");
    }

    // DeepSeek rejects response_format json_object unless the prompt itself
    // mentions "json", so guarantee the word is present.
    const wantsJson =
      config.responseMimeType === "application/json" ||
      options.responseMimeType === "application/json";
    const promptText =
      wantsJson &&
      !/json/i.test(
        `${config.systemPrompt || options.systemInstruction || ""} ${options.prompt}`,
      )
        ? `${options.prompt}\n\nRespond with valid JSON only.`
        : options.prompt;

    const response = await aiFetch(
      DEEPSEEK_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || "deepseek-chat",
          messages: [
            ...(config.systemPrompt || options.systemInstruction
              ? [
                  {
                    role: "system",
                    content: config.systemPrompt || options.systemInstruction,
                  },
                ]
              : []),
            { role: "user", content: promptText },
          ],
          stream: false,
          ...(typeof config.temperature === "number" ||
          typeof options.temperature === "number"
            ? {
                temperature:
                  config.temperature ?? options.temperature ?? undefined,
              }
            : {}),
          ...(config.maxOutputTokens || options.maxOutputTokens
            ? {
                max_tokens: config.maxOutputTokens || options.maxOutputTokens,
              }
            : {}),
          ...(config.responseMimeType === "application/json" ||
          options.responseMimeType === "application/json"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      },
      { label: "DeepSeek" },
    );

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(
        `DeepSeek request failed: ${response.status} ${failureText}`,
      );
    }

    const payload = await response.json();
    return {
      text: (payload?.choices?.[0]?.message?.content || "").trim() || "",
      provider: this.provider,
      model: config.model,
      usage: {
        promptTokens: payload?.usage?.prompt_tokens,
        completionTokens: payload?.usage?.completion_tokens,
        totalTokens: payload?.usage?.total_tokens,
      },
    };
  }

  async generateChat(
    config: AiRouteConfig,
    options: AiChatOptions,
  ): Promise<AiChatResult> {
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured");
    }

    const response = await aiFetch(
      DEEPSEEK_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiChatBody(config, options)),
      },
      { label: "DeepSeek" },
    );

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(
        `DeepSeek chat request failed: ${response.status} ${failureText}`,
      );
    }

    return parseOpenAiChatResponse(
      await response.json(),
      this.provider,
      config.model || "deepseek-chat",
    );
  }

  async generateChatStream(
    config: AiRouteConfig,
    options: AiChatStreamOptions,
  ): Promise<AiChatStreamResult> {
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is not configured");
    }

    return requestOpenAiChatStream({
      url: DEEPSEEK_API_URL,
      headers: { Authorization: `Bearer ${config.apiKey}` },
      config,
      options,
      provider: this.provider,
      model: config.model || "deepseek-chat",
      label: "DeepSeek",
    });
  }
}

@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  readonly provider = "gemini";

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error("Gemini API key is not configured");
    }

    const model = config.model || "gemini-2.0-flash";
    const systemPrompt = config.systemPrompt || options.systemInstruction;
    const endpoint = `${GEMINI_API_URL_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await aiFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(systemPrompt
            ? {
                systemInstruction: {
                  parts: [{ text: systemPrompt }],
                },
              }
            : {}),
          contents: [
            {
              role: "user",
              parts: [{ text: options.prompt }],
            },
          ],
          generationConfig: {
            ...(typeof config.temperature === "number" ||
            typeof options.temperature === "number"
              ? {
                  temperature:
                    config.temperature ?? options.temperature ?? undefined,
                }
              : {}),
            ...(config.maxOutputTokens || options.maxOutputTokens
              ? {
                  maxOutputTokens:
                    config.maxOutputTokens || options.maxOutputTokens,
                }
              : {}),
            ...(config.responseMimeType === "application/json" ||
            options.responseMimeType === "application/json"
              ? { responseMimeType: "application/json" }
              : {}),
          },
        }),
      },
      { label: "Gemini" },
    );

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(
        `Gemini request failed: ${response.status} ${failureText}`,
      );
    }

    const payload = await response.json();
    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim() || "";

    return {
      text,
      provider: this.provider,
      model,
      usage: {
        promptTokens: payload?.usageMetadata?.promptTokenCount,
        completionTokens: payload?.usageMetadata?.candidatesTokenCount,
        totalTokens: payload?.usageMetadata?.totalTokenCount,
      },
    };
  }

  async generateEmbedding(
    config: AiRouteConfig,
    options: AiEmbedOptions,
  ): Promise<AiEmbedResult> {
    if (!config.apiKey) {
      throw new Error("Gemini API key is not configured");
    }

    const model = config.model || "text-embedding-004";
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input];
    if (inputs.length === 0) {
      return { embeddings: [], provider: this.provider, model };
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < inputs.length; i += GEMINI_EMBED_BATCH_LIMIT) {
      const chunk = inputs.slice(i, i + GEMINI_EMBED_BATCH_LIMIT);
      const endpoint = `${GEMINI_API_URL_BASE}/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(config.apiKey)}`;
      const response = await aiFetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: chunk.map((text) => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
              ...(options.taskType ? { taskType: options.taskType } : {}),
              ...(options.dimensions
                ? { outputDimensionality: options.dimensions }
                : {}),
            })),
          }),
        },
        { label: "Gemini embeddings" },
      );

      if (!response.ok) {
        const failureText = await response.text();
        throw new Error(
          `Gemini embeddings request failed: ${response.status} ${failureText}`,
        );
      }

      const payload = await response.json();
      const chunkEmbeddings: number[][] = (payload?.embeddings || []).map(
        (item: { values?: number[] }) => item?.values || [],
      );
      if (chunkEmbeddings.length !== chunk.length) {
        throw new Error(
          `Gemini embeddings count mismatch: sent ${chunk.length}, got ${chunkEmbeddings.length}`,
        );
      }
      embeddings.push(...chunkEmbeddings);
    }

    return { embeddings, provider: this.provider, model };
  }
}
