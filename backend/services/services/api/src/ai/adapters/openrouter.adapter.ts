import { Injectable } from "@nestjs/common";
import {
  AiChatOptions,
  AiChatResult,
  AiChatStreamOptions,
  AiChatStreamResult,
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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

@Injectable()
export class OpenRouterAdapter implements AiProviderAdapter {
  readonly provider = "openrouter";

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }

    const messages = [
      ...(config.systemPrompt || options.systemInstruction
        ? [
            {
              role: "system",
              content: config.systemPrompt || options.systemInstruction,
            },
          ]
        : []),
      { role: "user", content: options.prompt },
    ];

    const response = await aiFetch(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "HTTP-Referer":
            process.env.OPENROUTER_REFERRER || "https://edutu.app",
          "X-Title": process.env.OPENROUTER_TITLE || "Edutu AI",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          ...(typeof config.temperature === "number" ||
          typeof options.temperature === "number"
            ? { temperature: config.temperature ?? options.temperature }
            : {}),
          ...(config.maxOutputTokens || options.maxOutputTokens
            ? { max_tokens: config.maxOutputTokens || options.maxOutputTokens }
            : {}),
        }),
      },
      { label: "OpenRouter" },
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = await response.json();
    return {
      text: payload?.choices?.[0]?.message?.content?.trim() || "",
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
      throw new Error("OpenRouter API key is not configured");
    }

    const response = await aiFetch(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "HTTP-Referer":
            process.env.OPENROUTER_REFERRER || "https://edutu.app",
          "X-Title": process.env.OPENROUTER_TITLE || "Edutu AI",
        },
        body: JSON.stringify(buildOpenAiChatBody(config, options)),
      },
      { label: "OpenRouter" },
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter chat request failed: ${response.status} ${await response.text()}`,
      );
    }

    return parseOpenAiChatResponse(
      await response.json(),
      this.provider,
      config.model,
    );
  }

  async generateChatStream(
    config: AiRouteConfig,
    options: AiChatStreamOptions,
  ): Promise<AiChatStreamResult> {
    if (!config.apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }

    return requestOpenAiChatStream({
      url: OPENROUTER_URL,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || "https://edutu.app",
        "X-Title": process.env.OPENROUTER_TITLE || "Edutu AI",
      },
      config,
      options,
      provider: this.provider,
      model: config.model,
      label: "OpenRouter",
    });
  }
}
