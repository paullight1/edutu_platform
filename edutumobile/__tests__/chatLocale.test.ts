/**
 * P0 safety fix: the backend's crisis-support path replies in whatever
 * `locale` the client sends (falling back to `Accept-Language`, then
 * English) — detection itself runs every locale's patterns regardless.
 * Before this change neither mobile send path sent `locale` at all, so a
 * detected crisis message always got an English reply. These tests pin the
 * plumbing on both real send paths (no module mocks — see
 * chatLocaleHookSwitch.test.ts for the hook-level "reflects a language
 * switch" contract, which needs both services mocked).
 */
import { sendChatMessage } from '@edutu/core/src/services/chat';
import { streamChatMessage } from '@edutu/core/src/services/chatStream';

// A Supabase stub whose chat-proxy path would throw — proves the backend
// path is the one exercised when fetch succeeds, same as chatContext.test.ts.
const supabaseStub = {
  functions: {
    invoke: async () => {
      throw new Error('chat-proxy should not be called when backend succeeds');
    },
  },
} as never;

describe('sendChatMessage — locale', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('sends the current locale in the backend request body', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ threadId: 't1' }),
    }));
    // @ts-expect-error partial fetch mock is fine for this test
    global.fetch = fetchMock;

    await sendChatMessage(supabaseStub, {
      message: 'Hello',
      userId: 'user_1',
      authToken: 'token_abc',
      locale: 'sw',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.locale).toBe('sw');
  });

  it('omits locale when the caller does not supply one', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ threadId: 't1' }),
    }));
    // @ts-expect-error partial fetch mock is fine for this test
    global.fetch = fetchMock;

    await sendChatMessage(supabaseStub, {
      message: 'Hello',
      userId: 'user_1',
      authToken: 'token_abc',
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('locale');
  });

  it('reflects a language switch between two sends with no other state change', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ threadId: 't1' }),
    }));
    // @ts-expect-error partial fetch mock is fine for this test
    global.fetch = fetchMock;

    await sendChatMessage(supabaseStub, {
      message: 'First message',
      userId: 'user_1',
      authToken: 'token_abc',
      locale: 'en',
    });
    await sendChatMessage(supabaseStub, {
      message: 'Second message, after switching in Settings',
      userId: 'user_1',
      authToken: 'token_abc',
      locale: 'ar',
    });

    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.locale).toBe('en');
    expect(secondBody.locale).toBe('ar');
  });
});

describe('streamChatMessage — locale', () => {
  const BASE = {
    message: 'Any scholarships?',
    userId: 'user-1',
    authToken: 'token',
    threadId: null,
  };

  function finalResult(content: string) {
    return {
      threadId: 'thread-1',
      userMessage: { id: 'u-1', role: 'user', content: BASE.message, created_at: '2026-07-20T00:00:00.000Z' },
      assistantMessage: { id: 'a-1', role: 'assistant', content, created_at: '2026-07-20T00:00:01.000Z' },
    };
  }

  function frame(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function bytes(text: string): Uint8Array {
    return Uint8Array.from(Buffer.from(text, 'utf8'));
  }

  /** A minimal fake `expo/fetch` that immediately completes the turn. */
  function fakeStream() {
    const chunks = [frame('turn.start', {}), frame('turn.final', finalResult('Reply.'))];
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true };
              const value = bytes(chunks[index]);
              index += 1;
              return { done: false, value };
            },
          };
        },
      },
    });
  }

  it('sends the current locale in the SSE POST body', async () => {
    const fetchImpl = fakeStream();
    await streamChatMessage({ ...BASE, locale: 'fr', fetchImpl: fetchImpl as never });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.locale).toBe('fr');
  });

  it('omits locale when the caller does not supply one', async () => {
    const fetchImpl = fakeStream();
    await streamChatMessage({ ...BASE, fetchImpl: fetchImpl as never });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty('locale');
  });
});
