import {
  AiChatMessage,
  AiChatOptions,
  AiChatResult,
  AiChatStreamOptions,
  AiChatStreamResult,
  AiProvider,
  AiRouteConfig,
  AiToolCall,
} from "../ai.types";
import { aiFetch } from "./ai-http";

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
    role: message.role,
    content: message.content,
  } as OpenAiWireMessage;
}

export function buildOpenAiChatBody(
  config: AiRouteConfig,
  options: AiChatOptions,
  extras: { stream?: boolean } = {},
): Record<string, unknown> {
  return {
    model: config.model,
    messages: options.messages.map(toWireMessage),
    // Default stays false: every existing (tool-calling) caller keeps the
    // buffered JSON path untouched.
    stream: extras.stream === true,
    // Without this, an OpenAI-dialect stream reports no token usage at all and
    // the ai_usage_logs row for a streamed turn would be blank.
    ...(extras.stream === true
      ? { stream_options: { include_usage: true } }
      : {}),
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

// ─── Token streaming ─────────────────────────────────────────────────────────

export interface OpenAiStreamOutcome {
  text: string;
  /**
   * Tool calls reassembled from the stream's `tool_calls` deltas. Complete only
   * once the stream has finished — fragments are accumulated by index until
   * then. Empty on a round where the model answered in prose.
   */
  toolCalls: AiToolCall[];
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** True when the stream ended without `[DONE]` / a finish_reason. */
  truncated: boolean;
}

/**
 * Partial tool call under construction. In the OpenAI dialect each streamed
 * chunk carries a `tool_calls` array whose entries are keyed by `index`; `id`
 * and `function.name` normally arrive whole in the first fragment for an index,
 * while `function.arguments` is split across many chunks. Both name and
 * arguments are concatenated because the wire format permits either to be
 * fragmented — except that a name fragment which is already the tail of the
 * accumulated name is dropped, since some relays repeat the full name on
 * every delta (see absorbToolCallDeltas).
 */
type ToolCallAccumulator = { id: string; name: string; arguments: string };

/**
 * Yields the raw bytes of a fetch body, supporting both the WHATWG reader
 * (Node's global fetch) and plain async iterables (test doubles, undici
 * streams).
 */
function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function signalAbortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : abortError();
}

async function* readBodyChunks(
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  if (!body) return;
  const candidate = body as {
    getReader?: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?: () => Promise<unknown> | void;
      releaseLock?: () => void;
    };
  };

  if (typeof candidate.getReader === "function") {
    const reader = candidate.getReader();
    const onAbort = () => {
      void Promise.resolve(reader.cancel?.()).catch(() => undefined);
    };
    if (signal?.aborted) throw signalAbortError(signal);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      for (;;) {
        if (signal?.aborted) throw signalAbortError(signal);
        const { done, value } = await reader.read();
        if (done) {
          if (signal?.aborted) throw signalAbortError(signal);
          return;
        }
        if (value) yield value;
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      reader.releaseLock?.();
    }
    return; // a reader-backed body is never also iterated
  }

  if (
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !==
    "function"
  ) {
    return;
  }
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    if (signal?.aborted) throw signalAbortError(signal);
    yield chunk;
  }
}

/**
 * Consumes an OpenAI-dialect SSE completion stream, handing every content
 * delta to `onToken` as it arrives, accumulating the full text, and rebuilding
 * any `tool_calls` the model requested out of their per-index fragments.
 *
 * Never throws on a mid-stream failure: whatever was already delivered to the
 * user is returned with `truncated: true` so the caller can finish the turn
 * honestly instead of discarding the answer or replaying it.
 */
export async function consumeOpenAiChatStream(
  body: unknown,
  onToken: (delta: string) => void,
  signal?: AbortSignal,
): Promise<OpenAiStreamOutcome> {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = false;
  let usage: OpenAiStreamOutcome["usage"] = {};
  // Keyed by the wire `index` so interleaved calls never bleed into each other.
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>();

  // Positional fallback silently merges distinct calls into one; warn the first
  // time it is needed rather than corrupting arguments quietly.
  let warnedMissingIndex = false;

  const absorbToolCallDeltas = (deltas: unknown) => {
    if (!Array.isArray(deltas)) return;
    deltas.forEach((entry: any, position: number) => {
      if (!entry || typeof entry !== "object") return;
      // `index` is what identifies the call across chunks; fall back to the
      // array position only if a provider omits it entirely.
      const hasIndex = typeof entry.index === "number";
      if (!hasIndex && !warnedMissingIndex) {
        warnedMissingIndex = true;
        console.warn(
          "OpenAI-dialect stream omitted `index` on a tool_calls delta; " +
            "falling back to array position, which can merge distinct tool calls into one.",
        );
      }
      const index = hasIndex ? entry.index : position;
      const existing = toolCallsByIndex.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
      };
      if (typeof entry.id === "string" && entry.id) existing.id = entry.id;
      const fn = entry.function;
      if (fn && typeof fn === "object") {
        // The name may legitimately arrive in fragments ("search_" +
        // "opportunities"), so it is concatenated — but some relays repeat the
        // WHOLE name on every delta, which blind concatenation turned into
        // `search_opportunitiessearch_opportunities` and hence "Unknown tool".
        // Skipping an append that is already the tail of what we have keeps
        // genuine fragmentation working while making repetition idempotent.
        if (
          typeof fn.name === "string" &&
          fn.name.length > 0 &&
          !existing.name.endsWith(fn.name)
        ) {
          existing.name += fn.name;
        }
        if (typeof fn.arguments === "string")
          existing.arguments += fn.arguments;
      }
      toolCallsByIndex.set(index, existing);
    });
  };

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim();
    // Blank keep-alive lines and `:` comments carry no payload.
    if (!line || line.startsWith(":")) return;
    if (!line.startsWith("data:")) return;

    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") {
      completed = true;
      return;
    }

    let frame: any;
    try {
      frame = JSON.parse(payload);
    } catch {
      return; // a malformed frame must not kill an otherwise-good stream
    }

    if (frame?.usage) {
      usage = {
        promptTokens: frame.usage.prompt_tokens,
        completionTokens: frame.usage.completion_tokens,
        totalTokens: frame.usage.total_tokens,
      };
    }

    const choice = frame?.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      text += delta;
      try {
        onToken(delta);
      } catch {
        // A dead client socket must not abort collection of the full text.
      }
    }
    absorbToolCallDeltas(choice?.delta?.tool_calls);
    if (choice?.finish_reason) completed = true;
  };

  try {
    for await (const chunk of readBodyChunks(body, signal)) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        handleLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    // Deliberately inside the try: a mid-stream throw means the trailing buffer
    // is an incomplete frame, so flushing it would parse garbage. Do not "fix"
    // this by hoisting it into the finally.
    if (buffer) handleLine(buffer);
  } catch (error) {
    if (signal?.aborted) throw signalAbortError(signal);
    // Socket died mid-stream. Keep what we have; `truncated` reports it.
  }

  // Only now are the per-index fragments complete and parseable. Emitted in
  // ascending index order — the order the model requested them in.
  const toolCalls: AiToolCall[] = [...toolCallsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => call)
    // An index that never carried a name is not an executable call.
    .filter((call) => call.name.length > 0)
    .map((call) => ({
      id: call.id || `call_${Math.random().toString(36).slice(2)}`,
      name: call.name,
      // Handed over verbatim even when it is not valid JSON: the tool layer
      // already turns unparseable arguments into an {"error": ...} result the
      // model can recover from, which beats killing the turn here.
      arguments: call.arguments,
    }));

  return { text: text.trim(), toolCalls, usage, truncated: !completed };
}

/**
 * One streamed chat-completion request against an OpenAI-dialect endpoint.
 *
 * The per-attempt timeout and retries of aiFetch cover ONLY stream
 * establishment — aiFetch resolves as soon as response headers arrive, so a
 * retry can never replay tokens the user has already seen. Once bytes are
 * flowing there is no retry at all.
 */
export async function requestOpenAiChatStream(params: {
  url: string;
  headers: Record<string, string>;
  config: AiRouteConfig;
  options: AiChatStreamOptions;
  provider: AiProvider;
  model: string;
  label: string;
  signal?: AbortSignal;
}): Promise<AiChatStreamResult> {
  const response = await aiFetch(
    params.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...params.headers,
      },
      body: JSON.stringify(
        buildOpenAiChatBody(params.config, params.options, { stream: true }),
      ),
    },
    { label: params.label, signal: params.signal },
  );

  if (!response.ok) {
    const failureText = await response.text().catch(() => "");
    throw new Error(
      `${params.label} chat stream request failed: ${response.status} ${failureText}`,
    );
  }

  let delivered = false;
  const outcome = await consumeOpenAiChatStream(
    response.body,
    (delta) => {
      delivered = true;
      params.options.onToken(delta);
    },
    params.signal,
  );

  // Nothing reached the user AND nothing usable came back — treat it as a
  // failed establishment so the caller can fall back to the buffered call
  // without duplicating any text. The `delivered` guard (rather than a check on
  // the trimmed text) is what keeps a whitespace-only stream — already rendered
  // by the client — out of the fallback path, where a different answer would
  // replace what the user just watched appear.
  if (!delivered && !outcome.text && !outcome.toolCalls.length) {
    throw new Error(`${params.label} chat stream produced no content`);
  }

  return {
    text: outcome.text,
    toolCalls: outcome.toolCalls,
    provider: params.provider,
    model: params.model,
    usage: outcome.usage,
    truncated: outcome.truncated,
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
