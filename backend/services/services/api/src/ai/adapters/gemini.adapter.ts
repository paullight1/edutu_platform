import { Injectable } from "@nestjs/common";
import {
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from "../ai.types";

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

    const response = await fetch(DEEPSEEK_API_URL, {
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
          { role: "user", content: options.prompt },
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
    });

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
    const response = await fetch(endpoint, {
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
    });

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
}
