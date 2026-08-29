import { Injectable } from "@nestjs/common";
import type {
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from "../ai.types";
import { aiFetch } from "./ai-http";

const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";

@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly provider = "openai";

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is not configured");
    }

    const model = config.model || "gpt-4.1-mini";
    const wantsJson =
      config.responseMimeType === "application/json" ||
      options.responseMimeType === "application/json";
    const responseFormat = options.responseJsonSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "edutu_response",
            strict: true,
            schema: options.responseJsonSchema,
          },
        }
      : wantsJson
        ? { type: "json_object" }
        : undefined;

    const response = await aiFetch(
      OPENAI_CHAT_COMPLETIONS_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
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
            ? { temperature: config.temperature ?? options.temperature }
            : {}),
          ...(config.maxOutputTokens || options.maxOutputTokens
            ? {
                max_tokens: config.maxOutputTokens || options.maxOutputTokens,
              }
            : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      },
      { label: "OpenAI", signal: options.signal },
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI request failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = await response.json();
    return {
      text: payload?.choices?.[0]?.message?.content?.trim() || "",
      provider: this.provider,
      model,
      usage: {
        promptTokens: payload?.usage?.prompt_tokens,
        completionTokens: payload?.usage?.completion_tokens,
        totalTokens: payload?.usage?.total_tokens,
      },
    };
  }
}
