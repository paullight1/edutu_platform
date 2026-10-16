import { Injectable } from "@nestjs/common";
import type {
  AiEmbedOptions,
  AiEmbedResult,
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from "../ai.types";
import { aiFetch } from "./ai-http";

const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** OpenAI strict structured outputs require closed objects and every field. */
function toStrictJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStrictJsonSchema);
  if (!isRecord(value)) return value;

  const schema = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      toStrictJsonSchema(child),
    ]),
  );
  const type = schema.type;
  const isObject =
    type === "object" || (Array.isArray(type) && type.includes("object"));

  if (isObject) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    schema.properties = properties;
    schema.required = Object.keys(properties);
    schema.additionalProperties = false;
  }

  return schema;
}

@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly provider = "openai";

  async generateEmbedding(
    config: AiRouteConfig,
    options: AiEmbedOptions,
  ): Promise<AiEmbedResult> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is not configured");
    }

    const model = config.model || "text-embedding-3-small";
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input];
    if (inputs.some((input) => !input.trim())) {
      throw new Error("OpenAI embeddings require non-empty input text");
    }

    // Keep each request below OpenAI's 300k aggregate-token limit even when
    // every input approaches the model's per-input limit of 8192 tokens.
    const embeddings: number[][] = [];
    let totalTokens = 0;
    for (let start = 0; start < inputs.length; start += 32) {
      const chunk = inputs.slice(start, start + 32);
      const response = await aiFetch(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: chunk,
            encoding_format: "float",
            ...(model.startsWith("text-embedding-3") && options.dimensions
              ? { dimensions: options.dimensions }
              : {}),
          }),
        },
        { label: "OpenAI embeddings", signal: options.signal },
      );

      if (!response.ok) {
        throw new Error(
          `OpenAI embeddings failed: ${response.status} ${await response.text()}`,
        );
      }

      const payload = await response.json();
      const data = payload?.data;
      if (!Array.isArray(data) || data.length !== chunk.length) {
        throw new Error("OpenAI returned an unexpected embeddings count");
      }
      const ordered = new Array<number[]>(chunk.length);
      for (const item of data) {
        if (
          !Number.isInteger(item?.index) ||
          item.index < 0 ||
          item.index >= chunk.length ||
          !Array.isArray(item.embedding) ||
          !item.embedding.length ||
          item.embedding.some(
            (value: unknown) =>
              typeof value !== "number" || !Number.isFinite(value),
          )
        ) {
          throw new Error("OpenAI returned an invalid embedding vector");
        }
        ordered[item.index] = item.embedding;
      }
      if (ordered.some((embedding) => !embedding)) {
        throw new Error("OpenAI returned an incomplete embeddings batch");
      }
      embeddings.push(...ordered);
      if (Number.isFinite(payload?.usage?.total_tokens)) {
        totalTokens += payload.usage.total_tokens;
      }
    }

    return {
      embeddings,
      provider: this.provider,
      model,
      usage: { totalTokens },
    };
  }

  async generateImage(
    config: AiRouteConfig,
    options: { prompt: string; signal?: AbortSignal },
  ): Promise<{ data: Buffer; mimeType: string; model: string }> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is not configured");
    }

    const model = config.model || "gpt-image-2.5-sunburst";
    const response = await aiFetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          size: "1024x1024",
          quality: "medium",
          output_format: "png",
          n: 1,
        }),
      },
      { label: "OpenAI image generation", signal: options.signal },
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI image generation failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = await response.json();
    const encoded = payload?.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded) {
      throw new Error("OpenAI returned no image data");
    }

    return {
      data: Buffer.from(encoded, "base64"),
      mimeType:
        payload?.output_format === "jpeg"
          ? "image/jpeg"
          : payload?.output_format === "webp"
            ? "image/webp"
            : "image/png",
      model,
    };
  }

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
            schema: toStrictJsonSchema(options.responseJsonSchema),
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
