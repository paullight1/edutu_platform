import {
  ChatStreamAbortedError,
  ChatStreamInterruptedError,
  ChatStreamUnavailableError,
  createSseParser,
  createUtf8StreamDecoder,
  streamChatMessage,
  type SseFrame,
} from '@edutu/core/src/services/chatStream';
import { ChatRateLimitError } from '@edutu/core/src/services/chat';

function bytes(text: string): Uint8Array {
  // Node's Buffer is a Uint8Array; copy so subarray semantics match RN.
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

function frame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function collect() {
  const frames: SseFrame[] = [];
  return { frames, parser: createSseParser((f) => frames.push(f)) };
}

describe('utf-8 stream decoder', () => {
  it('never emits half a multi-byte character', () => {
    const decoder = createUtf8StreamDecoder();
    const source = bytes('مرحبا 你好 🎓');
    let out = '';
    // Feed one byte at a time — the worst possible split.
    for (const byte of source) {
      out += decoder.decode(Uint8Array.of(byte));
    }
    out += decoder.flush();
    expect(out).toBe('مرحبا 你好 🎓');
    expect(out).not.toContain('�');
  });

  it('handles a character split exactly across two chunks', () => {
    const decoder = createUtf8StreamDecoder();
    const source = bytes('你好');
    const first = decoder.decode(source.slice(0, 2)); // half of 你
    const second = decoder.decode(source.slice(2));
    expect(first).toBe('');
    expect(first + second + decoder.flush()).toBe('你好');
  });
});

describe('sse frame parser', () => {
  it('parses several frames arriving in one chunk', () => {
    const { frames, parser } = collect();
    parser.push(bytes(frame('turn.start', {}) + frame('token', { content: 'Hi' }) + frame('token', { content: ' there' })));
    expect(frames.map((f) => f.event)).toEqual(['turn.start', 'token', 'token']);
    expect((frames[2].data as { content: string }).content).toBe(' there');
  });

  it('buffers a frame split mid-JSON across chunks', () => {
    const { frames, parser } = collect();
    const whole = frame('token', { content: 'Chevening deadline is 5 November' });
    parser.push(bytes(whole.slice(0, 22)));
    expect(frames).toHaveLength(0);
    parser.push(bytes(whole.slice(22)));
    expect(frames).toHaveLength(1);
    expect((frames[0].data as { content: string }).content).toBe('Chevening deadline is 5 November');
  });

  it('buffers a multi-byte character split across chunks inside a frame', () => {
    const { frames, parser } = collect();
    const raw = bytes(frame('token', { content: '你好，世界' }));
    // Split at a byte that is guaranteed to be mid-character.
    const cut = raw.length - 8;
    parser.push(raw.slice(0, cut));
    parser.push(raw.slice(cut));
    expect(frames).toHaveLength(1);
    expect((frames[0].data as { content: string }).content).toBe('你好，世界');
  });

  it('ignores keep-alive comments, id/retry fields and CRLF line endings', () => {
    const { frames, parser } = collect();
    parser.push(bytes(': ping\n\n'));
    parser.push(bytes('id: 7\r\nretry: 1000\r\nevent: token\r\ndata: {"content":"ok"}\r\n\r\n'));
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('token');
  });

  it('ignores an unknown event instead of throwing, and drops malformed JSON', () => {
    const { frames, parser } = collect();
    expect(() => {
      parser.push(bytes(frame('turn.vibes', { mood: 'good' })));
      parser.push(bytes('event: token\ndata: {not json\n\n'));
      parser.push(bytes(frame('token', { content: 'still here' })));
    }).not.toThrow();
    expect(frames.map((f) => f.event)).toEqual(['turn.vibes', 'token']);
    expect((frames[1].data as { content: string }).content).toBe('still here');
  });

  it('joins multi-line data fields', () => {
    const { frames, parser } = collect();
    parser.push(bytes('event: token\ndata: {"content":\ndata: "split"}\n\n'));
    expect((frames[0].data as { content: string }).content).toBe('split');
  });

  it('flushes a trailing frame that never got its blank line', () => {
    const { frames, parser } = collect();
    parser.push(bytes('event: token\ndata: {"content":"last"}'));
    expect(frames).toHaveLength(0);
    parser.end();
    expect(frames).toHaveLength(1);
  });
});

// --- streamChatMessage -------------------------------------------------------

const BASE = {
  message: 'Any scholarships?',
  userId: 'user-1',
  authToken: 'token',
  threadId: null,
};

function finalResult(content: string, metadata?: unknown) {
  return {
    threadId: 'thread-1',
    userMessage: { id: 'u-1', role: 'user', content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
    assistantMessage: { id: 'a-1', role: 'assistant', content, created_at: '2026-07-20T00:00:01.000Z', metadata },
  };
}

/** Builds a fake `expo/fetch` that replays the given chunks. */
function fakeStream(chunks: (string | Uint8Array)[], init?: { status?: number; ok?: boolean; noBody?: boolean; throwAt?: number }) {
  const status = init?.status ?? 200;
  return jest.fn().mockResolvedValue({
    ok: init?.ok ?? status < 400,
    status,
    body: init?.noBody
      ? null
      : {
        getReader: () => {
          let index = 0;
          return {
            read: async () => {
              if (init?.throwAt !== undefined && index === init.throwAt) {
                throw new Error('Network request failed');
              }
              if (index >= chunks.length) return { done: true };
              const chunk = chunks[index];
              index += 1;
              return { done: false, value: typeof chunk === 'string' ? bytes(chunk) : chunk };
            },
          };
        },
      },
  });
}

describe('streamChatMessage', () => {
  it('streams tokens and returns turn.final', async () => {
    const seen: string[] = [];
    const result = await streamChatMessage({
      ...BASE,
      handlers: { onContent: (c) => seen.push(c) },
      fetchImpl: fakeStream([
        frame('turn.start', {}),
        frame('token', { content: 'Chev' }),
        frame('token', { content: 'ening' }),
        frame('turn.final', finalResult('Chevening is open.')),
      ]) as never,
    });

    expect(seen).toEqual(['Chev', 'Chevening']);
    expect(result.assistantMessage.content).toBe('Chevening is open.');
  });

  // THE DISCARD RULE.
  it('discards the pre-tool preamble so the user never sees text that gets replaced', async () => {
    const seen: string[] = [];
    const result = await streamChatMessage({
      ...BASE,
      handlers: { onContent: (c) => seen.push(c) },
      fetchImpl: fakeStream([
        frame('turn.start', {}),
        frame('token', { content: 'Let me check' }),
        frame('token', { content: ' the database…' }),
        frame('tool.start', { id: 'call_1', name: 'search_opportunities' }),
        frame('tool.result', { id: 'call_1', name: 'search_opportunities', ok: true }),
        frame('token', { content: 'I found ' }),
        frame('token', { content: '3 matches.' }),
        frame('turn.final', finalResult('I found 3 matches.')),
      ]) as never,
    });

    // The buffer was cleared at tool.start, so the rendered text went back to
    // empty before the real answer streamed in.
    expect(seen).toEqual(['Let me check', 'Let me check the database…', '', 'I found ', 'I found 3 matches.']);
    // What the user is left looking at is exactly turn.final's content.
    expect(seen[seen.length - 1]).toBe(result.assistantMessage.content);
    expect(seen[seen.length - 1]).not.toContain('Let me check');
  });

  it('pairs parallel tool calls by id, and a repeated tool name does not confuse it', async () => {
    const tools: string[] = [];
    await streamChatMessage({
      ...BASE,
      handlers: { onToolStart: (tool) => tools.push(`${tool.name}:${tool.id}`) },
      fetchImpl: fakeStream([
        frame('turn.start', {}),
        frame('tool.start', { id: 'call_1', name: 'search_opportunities' }),
        frame('tool.start', { id: 'call_2', name: 'search_opportunities' }),
        frame('turn.final', finalResult('Two searches done.')),
      ]) as never,
    });
    expect(tools).toEqual(['search_opportunities:call_1', 'search_opportunities:call_2']);
  });

  it('marks the reply truncated when the server says the answer is partial', async () => {
    const result = await streamChatMessage({
      ...BASE,
      fetchImpl: fakeStream([
        frame('turn.start', {}),
        frame('turn.truncated', { reason: 'stream_ended_early' }),
        frame('turn.final', finalResult('Partial answer')),
      ]) as never,
    });
    expect(result.assistantMessage.metadata?.truncated).toBe(true);
  });

  it('keeps metadata.truncated from turn.final even without the notice event', async () => {
    const result = await streamChatMessage({
      ...BASE,
      fetchImpl: fakeStream([
        frame('turn.start', {}),
        frame('turn.final', finalResult('Partial answer', { truncated: true })),
      ]) as never,
    });
    expect(result.assistantMessage.metadata?.truncated).toBe(true);
  });

  it('raises a rate-limit error for HTTP 429 and for a 429 turn.error', async () => {
    await expect(
      streamChatMessage({ ...BASE, fetchImpl: fakeStream([], { status: 429 }) as never }),
    ).rejects.toBeInstanceOf(ChatRateLimitError);

    await expect(
      streamChatMessage({
        ...BASE,
        fetchImpl: fakeStream([
          frame('turn.start', {}),
          frame('turn.error', { message: 'limit', status: 429 }),
        ]) as never,
      }),
    ).rejects.toBeInstanceOf(ChatRateLimitError);
  });

  it('reports the stream as unavailable when it cannot be established', async () => {
    // No auth token.
    await expect(
      streamChatMessage({ ...BASE, authToken: null, fetchImpl: fakeStream([]) as never }),
    ).rejects.toBeInstanceOf(ChatStreamUnavailableError);

    // Server error.
    await expect(
      streamChatMessage({ ...BASE, fetchImpl: fakeStream([], { status: 502 }) as never }),
    ).rejects.toBeInstanceOf(ChatStreamUnavailableError);

    // No readable body (a runtime without streaming support).
    await expect(
      streamChatMessage({ ...BASE, fetchImpl: fakeStream([], { noBody: true }) as never }),
    ).rejects.toBeInstanceOf(ChatStreamUnavailableError);

    // Transport failure before anything arrived.
    await expect(
      streamChatMessage({ ...BASE, fetchImpl: fakeStream([], { throwAt: 0 }) as never }),
    ).rejects.toBeInstanceOf(ChatStreamUnavailableError);

    // fetch itself rejects.
    await expect(
      streamChatMessage({ ...BASE, fetchImpl: jest.fn().mockRejectedValue(new Error('offline')) as never }),
    ).rejects.toBeInstanceOf(ChatStreamUnavailableError);
  });

  it('hands back the partial text when the stream dies mid-answer', async () => {
    expect.assertions(2);
    try {
      await streamChatMessage({
        ...BASE,
        fetchImpl: fakeStream(
          [frame('turn.start', {}), frame('token', { content: 'Chevening op' })],
          { throwAt: 2 },
        ) as never,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ChatStreamInterruptedError);
      expect((error as ChatStreamInterruptedError).partialContent).toBe('Chevening op');
    }
  });

  it('treats a stream that just closes without turn.final as interrupted', async () => {
    await expect(
      streamChatMessage({
        ...BASE,
        fetchImpl: fakeStream([frame('turn.start', {}), frame('token', { content: 'half' })]) as never,
      }),
    ).rejects.toBeInstanceOf(ChatStreamInterruptedError);
  });

  it('surfaces the partial text when the user aborts mid-stream', async () => {
    expect.assertions(2);
    const controller = new AbortController();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          const chunks = [frame('turn.start', {}), frame('token', { content: 'Partial ans' })];
          let index = 0;
          return {
            read: async () => {
              if (controller.signal.aborted) {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                throw err;
              }
              if (index >= chunks.length) {
                controller.abort();
                const err = new Error('Aborted');
                err.name = 'AbortError';
                throw err;
              }
              const value = bytes(chunks[index]);
              index += 1;
              return { done: false, value };
            },
          };
        },
      },
    });

    try {
      await streamChatMessage({ ...BASE, signal: controller.signal, fetchImpl: fetchImpl as never });
    } catch (error) {
      expect(error).toBeInstanceOf(ChatStreamAbortedError);
      expect((error as ChatStreamAbortedError).partialContent).toBe('Partial ans');
    }
  });
});
