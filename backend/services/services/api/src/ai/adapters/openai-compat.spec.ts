import {
  buildOpenAiChatBody,
  consumeOpenAiChatStream,
  requestOpenAiChatStream,
} from "./openai-compat";
import { aiFetch } from "./ai-http";
import type { AiChatOptions, AiRouteConfig } from "../ai.types";

jest.mock("./ai-http", () => ({ aiFetch: jest.fn() }));

const encoder = new TextEncoder();

/** Minimal stand-in for a fetch body: an async iterable of encoded chunks. */
function bodyOf(
  chunks: string[],
  failAfter?: number,
): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let index = 0; index < chunks.length; index += 1) {
        if (failAfter !== undefined && index === failAfter) {
          throw new Error("socket hang up");
        }
        yield encoder.encode(chunks[index]);
      }
    },
  };
}

/** The shape Node's global fetch actually returns: a WHATWG reader. */
function readerBodyOf(chunks: string[]) {
  let index = 0;
  return {
    getReader: () => ({
      read: async () =>
        index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined },
      releaseLock: () => undefined,
    }),
    [Symbol.asyncIterator]: () => {
      throw new Error("must not fall through to the async iterator");
    },
  };
}

function frame(delta: string): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content: delta } }],
  })}\n\n`;
}

/** One SSE frame carrying a slice of the streamed `tool_calls` array. */
function toolFrame(
  toolCalls: Array<Record<string, unknown>>,
  finishReason?: string,
): string {
  return `data: ${JSON.stringify({
    choices: [
      {
        index: 0,
        delta: { tool_calls: toolCalls },
        ...(finishReason ? { finish_reason: finishReason } : {}),
      },
    ],
  })}\n\n`;
}

describe("buildOpenAiChatBody", () => {
  const config: AiRouteConfig = {
    feature: "chat.agent",
    provider: "deepseek",
    model: "deepseek-chat",
    isEnabled: true,
  };
  const options: AiChatOptions = {
    feature: "chat.agent",
    messages: [{ role: "user", content: "hi" }],
  };

  it("keeps stream:false and omits stream_options by default", () => {
    const body = buildOpenAiChatBody(config, options);
    expect(body.stream).toBe(false);
    expect(body).not.toHaveProperty("stream_options");
  });

  it("asks for usage accounting when streaming", () => {
    const body = buildOpenAiChatBody(config, options, { stream: true });
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

describe("consumeOpenAiChatStream", () => {
  it("aborts body consumption when the caller signal is aborted", async () => {
    const controller = new AbortController();
    let resolveRead!: (value: { done: boolean; value?: Uint8Array }) => void;
    const cancel = jest.fn(() => {
      resolveRead({ done: true });
    });
    const body = {
      getReader: () => ({
        read: () =>
          new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
            resolveRead = resolve;
          }),
        cancel,
        releaseLock: jest.fn(),
      }),
    };

    const pending = consumeOpenAiChatStream(
      body,
      () => undefined,
      controller.signal,
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("delivers content deltas to onToken in order and returns the full text", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`,
        frame("Hello"),
        frame(" there"),
        frame(", friend"),
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["Hello", " there", ", friend"]);
    expect(outcome.text).toBe("Hello there, friend");
    expect(outcome.truncated).toBe(false);
  });

  it("reads a WHATWG reader body (the shape Node's fetch returns)", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      readerBodyOf([frame("from"), frame(" the reader"), "data: [DONE]\n\n"]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["from", " the reader"]);
    expect(outcome.text).toBe("from the reader");
    expect(outcome.truncated).toBe(false);
  });

  it("reassembles deltas split across chunk boundaries", async () => {
    const seen: string[] = [];
    const whole = frame("split me");
    const outcome = await consumeOpenAiChatStream(
      bodyOf([whole.slice(0, 12), whole.slice(12), "data: [DONE]\n\n"]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["split me"]);
    expect(outcome.text).toBe("split me");
  });

  it("takes token counts from the final usage frame", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        frame("hi"),
        `data: ${JSON.stringify({
          choices: [],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 8,
            total_tokens: 128,
          },
        })}\n\n`,
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.usage).toEqual({
      promptTokens: 120,
      completionTokens: 8,
      totalTokens: 128,
    });
  });

  it("keeps the partial answer and reports truncation when the socket dies mid-stream", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      bodyOf([frame("Here is the "), frame("first half"), frame("never")], 2),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["Here is the ", "first half"]);
    expect(outcome.text).toBe("Here is the first half");
    expect(outcome.truncated).toBe(true);
  });

  it("reports truncation when the stream ends without [DONE] or a finish_reason", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([frame("cut off")]),
      () => undefined,
    );

    expect(outcome.text).toBe("cut off");
    expect(outcome.truncated).toBe(true);
  });

  it("ignores keep-alive comments and malformed frames", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        ": keep-alive\n\n",
        "data: {not json}\n\n",
        frame("survived"),
        "data: [DONE]\n\n",
      ]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["survived"]);
    expect(outcome.truncated).toBe(false);
  });

  it("still collects the full text when the token sink throws", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([frame("a"), frame("b"), "data: [DONE]\n\n"]),
      () => {
        throw new Error("client socket closed");
      },
    );

    expect(outcome.text).toBe("ab");
    expect(outcome.truncated).toBe(false);
  });
});

describe("consumeOpenAiChatStream — tool-call deltas", () => {
  it("accumulates argument fragments by index into one complete tool call", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([
          {
            index: 0,
            id: "call_abc",
            type: "function",
            function: { name: "search_opportunities", arguments: "" },
          },
        ]),
        toolFrame([{ index: 0, function: { arguments: '{"query":' } }]),
        toolFrame([{ index: 0, function: { arguments: '"scholar' } }]),
        toolFrame([{ index: 0, function: { arguments: 'ships","limit":3}' } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual([]);
    expect(outcome.text).toBe("");
    expect(outcome.truncated).toBe(false);
    expect(outcome.toolCalls).toEqual([
      {
        id: "call_abc",
        name: "search_opportunities",
        arguments: '{"query":"scholarships","limit":3}',
      },
    ]);
    expect(
      JSON.parse(outcome.toolCalls[0].arguments) as Record<string, unknown>,
    ).toEqual({ query: "scholarships", limit: 3 });
  });

  it("keeps two interleaved tool calls apart by index and in index order", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([
          {
            index: 1,
            id: "call_second",
            type: "function",
            function: { name: "get_profile", arguments: "" },
          },
        ]),
        toolFrame([
          {
            index: 0,
            id: "call_first",
            type: "function",
            function: { name: "search_opportunities", arguments: "" },
          },
        ]),
        toolFrame([{ index: 1, function: { arguments: '{"fie' } }]),
        toolFrame([{ index: 0, function: { arguments: '{"q":"gr' } }]),
        toolFrame([{ index: 1, function: { arguments: 'lds":["all"]}' } }]),
        toolFrame([{ index: 0, function: { arguments: 'ants"}' } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toEqual([
      {
        id: "call_first",
        name: "search_opportunities",
        arguments: '{"q":"grants"}',
      },
      {
        id: "call_second",
        name: "get_profile",
        arguments: '{"fields":["all"]}',
      },
    ]);
  });

  it("reassembles a tool name that itself arrives in fragments", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ index: 0, id: "c1", function: { name: "search_" } }]),
        toolFrame([{ index: 0, function: { name: "opportunities" } }]),
        toolFrame([{ index: 0, function: { arguments: "{}" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toEqual([
      { id: "c1", name: "search_opportunities", arguments: "{}" },
    ]);
  });

  it("delivers prose AND reconstructs tool calls from the same stream", async () => {
    const seen: string[] = [];
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        frame("Let me "),
        frame("check that."),
        toolFrame([
          {
            index: 0,
            id: "c1",
            type: "function",
            function: { name: "search_opportunities", arguments: '{"q":' },
          },
        ]),
        toolFrame([{ index: 0, function: { arguments: '"stem"}' } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      (delta) => seen.push(delta),
    );

    expect(seen).toEqual(["Let me ", "check that."]);
    expect(outcome.text).toBe("Let me check that.");
    expect(outcome.toolCalls).toEqual([
      { id: "c1", name: "search_opportunities", arguments: '{"q":"stem"}' },
    ]);
  });

  it("returns malformed accumulated arguments verbatim instead of throwing", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([
          {
            index: 0,
            id: "c1",
            type: "function",
            function: { name: "search_opportunities", arguments: '{"q":' },
          },
        ]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    // The turn recovers conversationally downstream (CoachToolsService.execute
    // turns unparseable arguments into an {"error": ...} result for the model),
    // so the parser must hand the fragment over rather than blow up here.
    expect(outcome.toolCalls).toEqual([
      { id: "c1", name: "search_opportunities", arguments: '{"q":' },
    ]);
  });

  it("synthesises an id for a tool call the provider never identified", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ index: 0, function: { name: "get_profile" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toHaveLength(1);
    expect(outcome.toolCalls[0].id).toMatch(/^call_/);
    expect(outcome.toolCalls[0].name).toBe("get_profile");
  });

  // Some OpenAI-dialect relays repeat the FULL function name on every
  // tool_calls delta instead of sending it once. Blind concatenation turned
  // those into `search_opportunitiessearch_opportunities…`, i.e. every tool
  // round degraded to "Unknown tool".
  it("does not duplicate a tool name a provider repeats on every delta", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([
          {
            index: 0,
            id: "c1",
            function: { name: "search_opportunities", arguments: '{"q":' },
          },
        ]),
        toolFrame([
          {
            index: 0,
            function: { name: "search_opportunities", arguments: '"stem"' },
          },
        ]),
        toolFrame([
          {
            index: 0,
            function: { name: "search_opportunities", arguments: "}" },
          },
        ]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toEqual([
      {
        id: "c1",
        name: "search_opportunities",
        arguments: '{"q":"stem"}',
      },
    ]);
  });

  it("does not re-append a trailing fragment a provider repeats", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ index: 0, id: "c1", function: { name: "search_" } }]),
        toolFrame([{ index: 0, function: { name: "opportunities" } }]),
        // The relay now echoes the tail it already sent.
        toolFrame([{ index: 0, function: { name: "opportunities" } }]),
        toolFrame([{ index: 0, function: { arguments: "{}" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toEqual([
      { id: "c1", name: "search_opportunities", arguments: "{}" },
    ]);
  });

  // Falling back to array position silently MERGES distinct calls into one —
  // exactly the corruption index keying exists to prevent. It must be loud.
  it("warns once per stream when a provider omits the tool-call index", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ id: "c1", function: { name: "get_profile" } }]),
        toolFrame([{ function: { arguments: "{}" } }]),
        toolFrame([{ function: { arguments: "" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/index/i);
    warn.mockRestore();
  });

  it("stays silent when every delta carries an index", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ index: 0, id: "c1", function: { name: "get_profile" } }]),
        toolFrame([{ index: 0, function: { arguments: "{}" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("drops an index that never produced a tool name", async () => {
    const outcome = await consumeOpenAiChatStream(
      bodyOf([
        toolFrame([{ index: 0, function: { arguments: "{}" } }]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
      () => undefined,
    );

    expect(outcome.toolCalls).toEqual([]);
  });
});

describe("requestOpenAiChatStream", () => {
  const config: AiRouteConfig = {
    feature: "chat.agent",
    provider: "deepseek",
    model: "deepseek-chat",
    isEnabled: true,
  };

  const params = (onToken: (delta: string) => void) => ({
    url: "https://api.deepseek.com/chat/completions",
    headers: {},
    config,
    options: {
      feature: "chat.agent" as const,
      messages: [{ role: "user" as const, content: "hi" }],
      onToken,
    },
    provider: "deepseek",
    model: "deepseek-chat",
    label: "DeepSeek",
  });

  beforeEach(() => {
    (aiFetch as jest.Mock).mockReset();
  });

  it("returns the reconstructed tool calls of a tools-only round", async () => {
    (aiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: bodyOf([
        toolFrame([
          {
            index: 0,
            id: "c1",
            type: "function",
            function: { name: "get_profile", arguments: "{}" },
          },
        ]),
        toolFrame([], "tool_calls"),
        "data: [DONE]\n\n",
      ]),
    });

    const result = await requestOpenAiChatStream(params(() => undefined));

    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([
      { id: "c1", name: "get_profile", arguments: "{}" },
    ]);
  });

  it("does not raise 'produced no content' once a delta reached the user", async () => {
    (aiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: bodyOf([frame("   "), "data: [DONE]\n\n"]),
    });

    const seen: string[] = [];
    const result = await requestOpenAiChatStream(
      params((delta) => seen.push(delta)),
    );

    // Whitespace-only trims to "" but WAS rendered by the client; throwing here
    // would push the turn into a fallback that shows a different answer.
    expect(seen).toEqual(["   "]);
    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([]);
  });

  it("still fails a stream that delivered nothing at all, so the caller can fall back", async () => {
    (aiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: bodyOf(["data: [DONE]\n\n"]),
    });

    await expect(
      requestOpenAiChatStream(params(() => undefined)),
    ).rejects.toThrow("produced no content");
  });
});
