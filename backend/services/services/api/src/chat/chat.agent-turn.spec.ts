import { ChatService } from "./chat.service";
import type { AiService } from "../ai";
import type { OpportunityRankingService } from "../opportunities/opportunity-ranking.service";
import { CoachToolsService } from "./tools/coach-tools.service";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// runAgentTurn reads the admin-editable persona from ai_prompts; stub the DB so
// the tests never open a pg connection (the real lookup already degrades to the
// default persona, but it would stall on the connection timeout first).
jest.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({ execute: () => Promise.resolve([]) }),
          }),
        }),
      }),
    }),
  },
}));

/**
 * Tool results now reach the model wrapped in nonce-delimited untrusted-data
 * framing (see common/untrusted-text) — the agent, unlike the legacy prompt,
 * holds mutating tools, so its tool payloads must be fenced. These assertions
 * are about ORDER and payload, so strip the frame; doing so also proves the
 * payload passes through byte-for-byte (framing, never filtering).
 */
const unframe = (content: string): string =>
  content.split("\n").slice(2, -1).join("\n");

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

type Emitted = { event: string; data: Record<string, unknown> };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending microtask/macrotask chains drain before asserting. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Mirrors the stub in chat.service.spec.ts: every table sendMessage touches.
function createQuery(result: { data: unknown; error: unknown }): any {
  return {
    select: () => createQuery(result),
    eq: () => createQuery(result),
    order: () => createQuery(result),
    limit: () => createQuery(result),
    update: () => createQuery(result),
    delete: () => createQuery(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason?: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
}

function buildSupabaseStub() {
  return {
    from: (table: string) => {
      switch (table) {
        case "chat_threads":
          return {
            ...createQuery({ data: null, error: null }),
            insert: () =>
              createQuery({ data: { id: "thread-1" }, error: null }),
          };
        case "chat_messages":
          return {
            ...createQuery({ data: [], error: null }),
            insert: (rows: Array<Record<string, unknown>>) =>
              createQuery({
                data: rows.map((row, index) => ({
                  id: `msg-${index}`,
                  created_at: new Date().toISOString(),
                  ...row,
                })),
                error: null,
              }),
          };
        case "profiles":
          return createQuery({ data: { user_id: "user-1" }, error: null });
        default:
          return createQuery({ data: [], error: null });
      }
    },
  };
}

function makeService() {
  const aiService = {
    generateChat: jest.fn(),
    generateChatStream: jest.fn(),
    generateJson: jest.fn().mockResolvedValue({ memories: [] }),
    generateText: jest.fn(),
  };
  const rankingService = { recordSignal: jest.fn() };
  const coachTools = {
    loadMemories: jest.fn().mockResolvedValue([]),
    getDefinitions: jest.fn().mockReturnValue([]),
    execute: jest.fn(),
  };

  const service = new ChatService(
    aiService as unknown as AiService,
    rankingService as unknown as OpportunityRankingService,
    coachTools as unknown as CoachToolsService,
  );

  const emitted: Emitted[] = [];
  const emit = (event: string, data: Record<string, unknown>) =>
    void emitted.push({ event, data });

  const runTurn = (extra: Record<string, unknown> = {}) =>
    (
      service as unknown as {
        runAgentTurn: (input: Record<string, unknown>) => Promise<{
          finalText: string;
        }>;
      }
    ).runAgentTurn({
      supabase: {} as SupabaseClient,
      userId: "user-1",
      message: "help me",
      history: [],
      isVoice: false,
      profile: null,
      goals: [],
      applications: [],
      emit,
      ...extra,
    });

  return { service, aiService, coachTools, emitted, emit, runTurn };
}

function toolCallRound(
  calls: Array<{ id: string; name: string }>,
): Record<string, unknown> {
  return {
    text: "",
    toolCalls: calls.map((call) => ({ ...call, arguments: "{}" })),
    provider: "deepseek",
    model: "deepseek-chat",
    usage: {},
  };
}

function proseRound(text: string): Record<string, unknown> {
  return {
    text,
    toolCalls: [],
    provider: "deepseek",
    model: "deepseek-chat",
    usage: {},
  };
}

function streamRound(
  chunks: string[],
  extra: Record<string, unknown> = {},
): (options: {
  onToken: (delta: string) => void;
}) => Promise<Record<string, unknown>> {
  return async (options) => {
    for (const chunk of chunks) options.onToken(chunk);
    return {
      text: chunks.join(""),
      toolCalls: [],
      provider: "deepseek",
      model: "deepseek-chat",
      usage: {},
      ...extra,
    };
  };
}

/**
 * A streamed round that ends in tool calls: any prose deltas reach onToken, and
 * the reconstructed calls come back on the result (exactly what the adapter's
 * delta accumulator produces).
 */
function streamToolCallRound(
  calls: Array<{ id: string; name: string; arguments?: string }>,
  prose: string[] = [],
): (options: {
  onToken: (delta: string) => void;
}) => Promise<Record<string, unknown>> {
  return async (options) => {
    for (const chunk of prose) options.onToken(chunk);
    return {
      text: prose.join(""),
      toolCalls: calls.map((call) => ({ arguments: "{}", ...call })),
      provider: "deepseek",
      model: "deepseek-chat",
      usage: {},
    };
  };
}

describe("runAgentTurn — tool.result ok flag", () => {
  it('reports ok for a successful result whose payload contains a nested "error" key', async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(toolCallRound([{ id: "c1", name: "search" }]))
      .mockResolvedValueOnce(proseRound("here you go"));
    // Legitimate success payload: the substring `"error"` is present, but only
    // nested inside per-item diagnostics — the call itself succeeded.
    coachTools.execute.mockResolvedValue(
      JSON.stringify({
        opportunities: [
          { title: "Debugging bootcamp", checks: [{ error: null }] },
        ],
      }),
    );

    await runTurn();

    const results = emitted.filter((item) => item.event === "tool.result");
    expect(results).toHaveLength(1);
    // `id` correlates the result with its tool.start (Fix 2).
    expect(results[0].data).toEqual({ id: "c1", name: "search", ok: true });
  });

  it("reports not-ok for a real top-level error result", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(toolCallRound([{ id: "c1", name: "search" }]))
      .mockResolvedValueOnce(proseRound("sorry"));
    coachTools.execute.mockResolvedValue(
      JSON.stringify({ error: "Unknown tool: search" }),
    );

    await runTurn();

    const results = emitted.filter((item) => item.event === "tool.result");
    expect(results[0].data).toEqual({ id: "c1", name: "search", ok: false });
  });

  it("flags unparseable tool output explicitly instead of calling it ok", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(toolCallRound([{ id: "c1", name: "search" }]))
      .mockResolvedValueOnce(proseRound("hmm"));
    coachTools.execute.mockResolvedValue("<html>gateway timeout</html>");

    await runTurn();

    const results = emitted.filter((item) => item.event === "tool.result");
    expect(results[0].data).toEqual({
      id: "c1",
      name: "search",
      ok: false,
      unparsed: true,
    });
  });
});

describe("runAgentTurn — parallel tool execution", () => {
  it("starts every tool call of a round before the first one resolves", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([
          { id: "c1", name: "slow_tool" },
          { id: "c2", name: "fast_tool" },
        ]),
      )
      .mockResolvedValueOnce(proseRound("done"));

    const slow = deferred<string>();
    const started: string[] = [];
    coachTools.execute.mockImplementation((name: string) => {
      started.push(name);
      return name === "slow_tool"
        ? slow.promise
        : Promise.resolve(JSON.stringify({ ok: true }));
    });

    const turn = runTurn();
    await flush();

    expect(started).toEqual(["slow_tool", "fast_tool"]);

    slow.resolve(JSON.stringify({ ok: true }));
    await turn;
  });

  it("appends tool results in the model's requested order even when the second finishes first", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([
          { id: "c1", name: "slow_tool" },
          { id: "c2", name: "fast_tool" },
        ]),
      )
      .mockResolvedValueOnce(proseRound("done"));

    const slow = deferred<string>();
    coachTools.execute.mockImplementation((name: string) =>
      name === "slow_tool"
        ? slow.promise
        : Promise.resolve(JSON.stringify({ from: "fast" })),
    );

    const turn = runTurn();
    await flush();
    slow.resolve(JSON.stringify({ from: "slow" }));
    await turn;

    const secondCall = aiService.generateChat.mock.calls[1][0] as {
      messages: Array<{ role: string; toolCallId?: string; content: string }>;
    };
    const toolMessages = secondCall.messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolMessages.map((message) => message.toolCallId)).toEqual([
      "c1",
      "c2",
    ]);
    expect(toolMessages.map((message) => unframe(message.content))).toEqual([
      JSON.stringify({ from: "slow" }),
      JSON.stringify({ from: "fast" }),
    ]);
  });

  it("does not let one rejecting tool reject the whole round", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([
          { id: "c1", name: "boom_tool" },
          { id: "c2", name: "fine_tool" },
        ]),
      )
      .mockResolvedValueOnce(proseRound("recovered"));
    coachTools.execute.mockImplementation((name: string) =>
      name === "boom_tool"
        ? Promise.reject(new Error("tool exploded"))
        : Promise.resolve(JSON.stringify({ ok: true })),
    );

    const outcome = await runTurn();

    expect(outcome.finalText).toBe("recovered");
    const secondCall = aiService.generateChat.mock.calls[1][0] as {
      messages: Array<{ role: string; toolCallId?: string; content: string }>;
    };
    const toolMessages = secondCall.messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolMessages).toHaveLength(2);
    expect(JSON.parse(unframe(toolMessages[0].content))).toHaveProperty(
      "error",
    );
  });
});

describe("runAgentTurn — streaming every round", () => {
  it("streams the very first round, so a one-round answer reaches the user live", async () => {
    const { aiService, runTurn } = makeService();
    aiService.generateChatStream.mockImplementation(
      streamRound(["Here", " is", " your plan."]),
    );

    const tokens: string[] = [];
    const outcome = await runTurn({ onToken: (t: string) => tokens.push(t) });

    // The whole point of the task: no buffered round precedes the tokens.
    expect(aiService.generateChat).not.toHaveBeenCalled();
    expect(aiService.generateChatStream).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(["Here", " is", " your plan."]);
    expect(outcome.finalText).toBe("Here is your plan.");
    // Streamed rounds now legitimately carry tools — the adapter reassembles
    // tool_calls out of the deltas rather than the round being tool-free.
    const streamArgs = aiService.generateChatStream.mock.calls[0][0] as {
      tools?: unknown[];
      onToken?: unknown;
    };
    expect(Array.isArray(streamArgs.tools)).toBe(true);
    expect(typeof streamArgs.onToken).toBe("function");
  });

  it("executes tool calls reconstructed from a streamed round, then streams the answer", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChatStream
      .mockImplementationOnce(
        streamToolCallRound([{ id: "c1", name: "search_opportunities" }]),
      )
      .mockImplementationOnce(streamRound(["Found ", "one."]));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    const tokens: string[] = [];
    const outcome = await runTurn({ onToken: (t: string) => tokens.push(t) });

    expect(coachTools.execute).toHaveBeenCalledWith(
      "search_opportunities",
      "{}",
      expect.anything(),
    );
    expect(tokens).toEqual(["Found ", "one."]);
    expect(outcome.finalText).toBe("Found one.");
    expect(emitted.filter((item) => item.event === "tool.result")).toHaveLength(
      1,
    );
  });

  it("delivers prose from a mixed round and still runs its tool calls", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChatStream
      .mockImplementationOnce(
        streamToolCallRound(
          [{ id: "c1", name: "get_profile" }],
          ["Let me ", "check."],
        ),
      )
      .mockImplementationOnce(streamRound(["All set."]));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    const tokens: string[] = [];
    await runTurn({ onToken: (t: string) => tokens.push(t) });

    expect(tokens).toEqual(["Let me ", "check.", "All set."]);
    expect(coachTools.execute).toHaveBeenCalledTimes(1);
  });

  it("preserves requested order and parallelism for streamed tool rounds", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChatStream
      .mockImplementationOnce(
        streamToolCallRound([
          { id: "c1", name: "slow_tool" },
          { id: "c2", name: "fast_tool" },
        ]),
      )
      .mockImplementationOnce(streamRound(["done"]));

    const slow = deferred<string>();
    const started: string[] = [];
    coachTools.execute.mockImplementation((name: string) => {
      started.push(name);
      return name === "slow_tool"
        ? slow.promise
        : Promise.resolve(JSON.stringify({ from: "fast" }));
    });

    const turn = runTurn({ onToken: () => undefined });
    await flush();
    expect(started).toEqual(["slow_tool", "fast_tool"]);
    slow.resolve(JSON.stringify({ from: "slow" }));
    await turn;

    const secondCall = aiService.generateChatStream.mock.calls[1][0] as {
      messages: Array<{ role: string; toolCallId?: string; content: string }>;
    };
    const toolMessages = secondCall.messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolMessages.map((message) => message.toolCallId)).toEqual([
      "c1",
      "c2",
    ]);
    expect(toolMessages.map((message) => unframe(message.content))).toEqual([
      JSON.stringify({ from: "slow" }),
      JSON.stringify({ from: "fast" }),
    ]);
  });

  it("recovers conversationally when accumulated tool arguments are malformed", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    // The adapter hands over whatever fragment it accumulated; a cut-off
    // arguments string must reach the tool layer verbatim and come back as an
    // error result the model can answer around — never a thrown turn.
    aiService.generateChatStream
      .mockImplementationOnce(
        streamToolCallRound([
          { id: "c1", name: "search_opportunities", arguments: '{"q":' },
        ]),
      )
      .mockImplementationOnce(streamRound(["Sorry, let me retry."]));
    // The REAL dispatcher: its tools are all closures over the injected
    // services, so a bare instance is enough to exercise argument handling.
    const realTools = new CoachToolsService(
      ...(Array(11).fill(null) as [
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
      ]),
    );
    coachTools.execute.mockImplementation(
      (name: string, argsJson: string, ctx: any) =>
        realTools.execute(name, argsJson, ctx),
    );

    const outcome = await runTurn({ onToken: () => undefined });

    expect(coachTools.execute).toHaveBeenCalledWith(
      "search_opportunities",
      '{"q":',
      expect.anything(),
    );
    expect(outcome.finalText).toBe("Sorry, let me retry.");
    const secondCall = aiService.generateChatStream.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolMessage = secondCall.messages.find(
      (message) => message.role === "tool",
    );
    expect(JSON.parse(unframe(toolMessage!.content))).toHaveProperty("error");
    expect(
      emitted.find((item) => item.event === "tool.result")?.data,
    ).toMatchObject({ ok: false });
  });

  it("uses the buffered call, not the stream, when no onToken is supplied", async () => {
    const { aiService, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(proseRound(""))
      .mockResolvedValueOnce(proseRound("buffered answer"));

    const outcome = await runTurn();

    expect(aiService.generateChatStream).not.toHaveBeenCalled();
    expect(outcome.finalText).toBe("buffered answer");
  });

  // THE safety guard: tool-call arguments accumulated from a cut-off stream are
  // by definition incomplete, so a truncated round must never execute them.
  it("never executes tool calls reconstructed from a truncated round", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChatStream.mockImplementation(async (options: any) => {
      options.onToken("Let me check");
      return {
        text: "Let me check",
        toolCalls: [
          {
            id: "c1",
            name: "search_opportunities",
            arguments: '{"query":"scho',
          },
        ],
        provider: "deepseek",
        model: "deepseek-chat",
        usage: {},
        truncated: true,
      };
    });

    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const outcome = (await runTurn({ onToken: () => undefined })) as {
      finalText: string;
      truncated?: boolean;
    };
    warn.mockRestore();

    expect(coachTools.execute).not.toHaveBeenCalled();
    expect(outcome.finalText).toBe("Let me check");
    expect(outcome.truncated).toBe(true);
    expect(emitted).toContainEqual({
      event: "turn.truncated",
      data: { reason: "stream_ended_early" },
    });
    // One round only: the turn ends there rather than pressing on.
    expect(aiService.generateChatStream).toHaveBeenCalledTimes(1);
    expect(aiService.generateChat).not.toHaveBeenCalled();
  });

  it("keeps a partially streamed answer and reports the truncation", async () => {
    const { aiService, emitted, runTurn } = makeService();
    aiService.generateChat.mockResolvedValueOnce(proseRound(""));
    aiService.generateChatStream.mockImplementation(
      streamRound(["Half an ", "answer"], { truncated: true }),
    );

    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const outcome = await runTurn({ onToken: () => undefined });
    warn.mockRestore();

    expect(outcome.finalText).toBe("Half an answer");
    expect(emitted).toContainEqual({
      event: "turn.truncated",
      data: { reason: "stream_ended_early" },
    });
  });
});

describe("sendMessage — SSE token stream", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    (createClient as jest.Mock).mockReturnValue(buildSupabaseStub());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("emits every delta and still returns the complete assistant message", async () => {
    const { service, aiService } = makeService();
    aiService.generateChat.mockResolvedValueOnce(proseRound(""));
    aiService.generateChatStream.mockImplementation(
      streamRound(["Try ", "the Mastercard ", "Foundation scholarship."]),
    );

    const events: Emitted[] = [];
    const result = await service.sendMessage(
      "user-1",
      { message: "any scholarships for me?" },
      {
        emit: (event, data) => void events.push({ event, data }),
        onToken: (content) =>
          void events.push({ event: "token", data: { content } }),
      },
    );

    const streamed = events
      .filter((item) => item.event === "token")
      .map((item) => item.data.content)
      .join("");
    expect(streamed).toBe("Try the Mastercard Foundation scholarship.");
    // turn.final's payload — unchanged contract: the COMPLETE message.
    expect(result.assistantMessage?.content).toBe(
      "Try the Mastercard Foundation scholarship.",
    );
  });

  it("does not stream on the plain POST /chat/messages path", async () => {
    const { service, aiService } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(proseRound(""))
      .mockResolvedValueOnce(proseRound("buffered reply"));

    const result = await service.sendMessage("user-1", { message: "hello" });

    expect(aiService.generateChatStream).not.toHaveBeenCalled();
    expect(result.assistantMessage?.content).toBe("buffered reply");
  });

  // Fix 1 — a truncated answer must be marked in a payload shipped clients
  // already parse, not only in a `turn.truncated` event none of them know.
  it("marks a truncated turn in the assistant message metadata", async () => {
    const { service, aiService } = makeService();
    aiService.generateChatStream.mockImplementation(
      streamRound(["Half an ", "answer"], { truncated: true }),
    );

    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const result = await service.sendMessage(
      "user-1",
      { message: "hello" },
      { onToken: () => undefined },
    );
    warn.mockRestore();

    expect(
      (result.assistantMessage as { metadata: Record<string, unknown> })
        .metadata.truncated,
    ).toBe(true);
  });

  it("leaves the metadata untouched on a complete turn", async () => {
    const { service, aiService } = makeService();
    aiService.generateChatStream.mockImplementation(streamRound(["All good."]));

    const result = await service.sendMessage(
      "user-1",
      { message: "hello" },
      { onToken: () => undefined },
    );

    expect(
      (result.assistantMessage as { metadata: Record<string, unknown> })
        .metadata,
    ).not.toHaveProperty("truncated");
  });

  // Fix 3 — once the user has watched tokens appear, the legacy single-shot
  // pipeline must not quietly substitute a completely different answer.
  it("does not substitute the legacy pipeline after tokens reached the user", async () => {
    const { service, aiService } = makeService();
    aiService.generateChatStream.mockImplementation(async (options: any) => {
      options.onToken("Here is the fir");
      throw new Error("socket hang up");
    });
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({ message: "A totally different answer" }),
      usage: {},
    });

    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      service.sendMessage(
        "user-1",
        { message: "any scholarships for me?" },
        { onToken: () => undefined },
      ),
    ).rejects.toThrow("socket hang up");
    error.mockRestore();

    expect(aiService.generateText).not.toHaveBeenCalled();
  });

  // A2c Fix 3 — text streamed BEFORE a tool.start is discardable preamble, not
  // an answer: the client is told to clear its buffer at that boundary, so a
  // later total failure may still degrade to the legacy pipeline.
  it("still degrades to the legacy pipeline when only preamble preceded a tool call", async () => {
    const { service, aiService, coachTools } = makeService();
    aiService.generateChatStream
      .mockImplementationOnce(async (options: any) => {
        options.onToken("Let me check that for you…");
        return {
          text: "Let me check that for you…",
          toolCalls: [
            { id: "c1", name: "search_opportunities", arguments: "{}" },
          ],
          provider: "deepseek",
          model: "deepseek-chat",
          usage: {},
        };
      })
      .mockImplementationOnce(async () => {
        throw new Error("provider outage");
      });
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({ message: "Legacy answer" }),
      usage: {},
    });

    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await service.sendMessage(
      "user-1",
      { message: "any scholarships for me?" },
      { onToken: () => undefined, emit: () => undefined },
    );
    error.mockRestore();

    expect(result.assistantMessage?.content).toBe("Legacy answer");
  });

  // …but text streamed AFTER the last tool.start IS the answer in progress.
  it("still rethrows when tokens arrived after the last tool call", async () => {
    const { service, aiService, coachTools } = makeService();
    aiService.generateChatStream
      .mockImplementationOnce(async () => ({
        text: "",
        toolCalls: [
          { id: "c1", name: "search_opportunities", arguments: "{}" },
        ],
        provider: "deepseek",
        model: "deepseek-chat",
        usage: {},
      }))
      .mockImplementationOnce(async (options: any) => {
        options.onToken("Here is the fir");
        throw new Error("socket hang up");
      });
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({ message: "A totally different answer" }),
      usage: {},
    });

    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      service.sendMessage(
        "user-1",
        { message: "any scholarships for me?" },
        { onToken: () => undefined, emit: () => undefined },
      ),
    ).rejects.toThrow("socket hang up");
    error.mockRestore();

    expect(aiService.generateText).not.toHaveBeenCalled();
  });

  it("still degrades to the legacy pipeline when nothing was streamed", async () => {
    const { service, aiService } = makeService();
    aiService.generateChatStream.mockRejectedValue(new Error("route disabled"));
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({ message: "Legacy answer" }),
      usage: {},
    });

    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await service.sendMessage(
      "user-1",
      { message: "any scholarships for me?" },
      { onToken: () => undefined },
    );
    error.mockRestore();

    expect(result.assistantMessage?.content).toBe("Legacy answer");
  });
});

// Fix 2 — parallel tool execution broke arrival-order pairing; both events now
// carry the call id so a client can never attribute one tool's status to another.
describe("runAgentTurn — tool event correlation ids", () => {
  it("tags tool.start and tool.result with the call id, including a repeated tool", async () => {
    const { aiService, coachTools, emitted, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([
          { id: "call_a", name: "search_opportunities" },
          { id: "call_b", name: "search_opportunities" },
        ]),
      )
      .mockResolvedValueOnce(proseRound("done"));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    await runTurn();

    expect(
      emitted.filter((item) => item.event === "tool.start").map((i) => i.data),
    ).toEqual([
      { id: "call_a", name: "search_opportunities" },
      { id: "call_b", name: "search_opportunities" },
    ]);
    expect(
      emitted.filter((item) => item.event === "tool.result").map((i) => i.data),
    ).toEqual([
      { id: "call_a", name: "search_opportunities", ok: true },
      { id: "call_b", name: "search_opportunities", ok: true },
    ]);
  });
});

/**
 * The roadmap affordance used to be gated by English regexes in the app. It is
 * now a server signal derived from which tools the turn invoked — a structural
 * fact, so it behaves identically whatever language the user writes in.
 */
describe("runAgentTurn — roadmapIntent signal", () => {
  const outcomeOf = async (
    run: () => Promise<{ finalText: string }>,
  ): Promise<Record<string, unknown>> =>
    (await run()) as unknown as Record<string, unknown>;

  it("leaves the flag off for a plain successful create_roadmap turn — the roadmap already exists, so the CTA would be redundant (and re-running it costs credits again)", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c1", name: "create_roadmap" }]),
      )
      .mockResolvedValueOnce(proseRound("built it"));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    const outcome = await outcomeOf(() => runTurn());

    expect("roadmapIntent" in outcome).toBe(false);
  });

  it("leaves the flag off for a plain successful create_goals turn, for the same reason", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c1", name: "create_goals" }]),
      )
      .mockResolvedValueOnce(proseRound("added them"));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    const outcome = await outcomeOf(() => runTurn());

    expect("roadmapIntent" in outcome).toBe(false);
  });

  it("sets the flag from the pre-creation offer_roadmap signal, in any language", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([
          { id: "c1", name: "search_opportunities" },
          { id: "c2", name: "offer_roadmap" },
        ]),
      )
      .mockResolvedValueOnce(proseRound("voici le plan"));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    // Swahili in, no roadmap keyword the server could ever have matched.
    const outcome = await outcomeOf(() =>
      runTurn({ message: "nisaidie kujiandaa kwa maombi yangu" }),
    );

    expect(outcome.roadmapIntent).toBe(true);
  });

  it("still offers the affordance after create_roadmap fails, via the model's own offer_roadmap retry signal — create_roadmap alone no longer sets the flag", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    // Round 1: the model tries to build the roadmap and it fails on credits.
    // Per the offer_roadmap tool description, a failed create_roadmap does
    // NOT count as "already succeeded", so the model is told to still call
    // offer_roadmap — which it does in round 2 — so the user keeps a Build
    // roadmap button to retry instead of being left with nothing.
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c1", name: "create_roadmap" }]),
      )
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c2", name: "offer_roadmap" }]),
      )
      .mockResolvedValueOnce(proseRound("that didn't work — want to retry?"));
    coachTools.execute
      .mockResolvedValueOnce(JSON.stringify({ error: "out of credits" }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true }));

    const outcome = await outcomeOf(() => runTurn());

    expect(outcome.roadmapIntent).toBe(true);
  });

  it("leaves the flag off if create_roadmap fails and the model does not also call offer_roadmap", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c1", name: "create_roadmap" }]),
      )
      .mockResolvedValueOnce(proseRound("that didn't work"));
    coachTools.execute.mockResolvedValue(
      JSON.stringify({ error: "out of credits" }),
    );

    const outcome = await outcomeOf(() => runTurn());

    // This is the accepted tradeoff, identical to offer_roadmap's existing
    // pre-creation case: recall depends on model discretion, not a guarantee.
    expect("roadmapIntent" in outcome).toBe(false);
  });

  it("leaves the flag off for an unrelated turn, even one that says 'roadmap'", async () => {
    const { aiService, coachTools, runTurn } = makeService();
    aiService.generateChat
      .mockResolvedValueOnce(
        toolCallRound([{ id: "c1", name: "search_opportunities" }]),
      )
      .mockResolvedValueOnce(proseRound("here are some scholarships"));
    coachTools.execute.mockResolvedValue(JSON.stringify({ ok: true }));

    // The word is right there in the message; only tool usage decides.
    const outcome = await outcomeOf(() =>
      runTurn({ message: "show me a roadmap of scholarships" }),
    );

    expect("roadmapIntent" in outcome).toBe(false);
  });
});
