import {
  AiChatMessage,
  AiChatOptions,
  AiChatResult,
  AiProvider,
  AiRouteConfig,
  AiToolCall,
} from "../ai.types";

/**
 * DeepSeek and OpenRouter both speak the OpenAI chat-completions dialect,
 * including `tools`/`tool_calls`. This module is the single translation
 * layer between our provider-neutral chat types and that wire format.
 */

type OpenAiWireMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toWireMessage(message: AiChatMessage): OpenAiWireMessage {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId || "",
      content: message.content,
    };
  }
  return {
    role: message.role as "system" | "user" | "assistant",
    content: message.content,
  } as OpenAiWireMessage;
}

export function buildOpenAiChatBody(
  config: AiRouteConfig,
  options: AiChatOptions,
): Record<string, unknown> {
  return {
    model: config.model,
    messages: options.messages.map(toWireMessage),
    stream: false,
    ...(typeof config.temperature === "number" ||
    typeof options.temperature === "number"
      ? { temperature: config.temperature ?? options.temperature }
      : {}),
    ...(config.maxOutputTokens || options.maxOutputTokens
      ? { max_tokens: config.maxOutputTokens || options.maxOutputTokens }
      : {}),
    ...(options.tools?.length
      ? {
          tools: options.tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: options.toolChoice ?? "auto",
        }
      : {}),
  };
}

export function parseOpenAiChatResponse(
  payload: any,
  provider: AiProvider,
  model: string,
): AiChatResult {
  const message = payload?.choices?.[0]?.message;
  const toolCalls: AiToolCall[] = Array.isArray(message?.tool_calls)
    ? message.tool_calls
        .filter((call: any) => call?.function?.name)
        .map((call: any) => ({
          id: String(call.id || `call_${Math.random().toString(36).slice(2)}`),
          name: String(call.function.name),
          arguments:
            typeof call.function.arguments === "string"
              ? call.function.arguments
              : JSON.stringify(call.function.arguments ?? {}),
        }))
    : [];

  return {
    text: (message?.content || "").trim(),
    toolCalls,
    provider,
    model,
    usage: {
      promptTokens: payload?.usage?.prompt_tokens,
      completionTokens: payload?.usage?.completion_tokens,
      totalTokens: payload?.usage?.total_tokens,
    },
  };
}
