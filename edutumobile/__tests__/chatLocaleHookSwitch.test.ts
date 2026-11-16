/**
 * P0 safety fix, hook-level half: `useChat` must read `locale` off whatever
 * the caller (the chat screen) passes it on each render — never cache it —
 * so a user who opens Settings and switches language mid-conversation gets
 * the crisis-support reply (or any reply) in the new language on their very
 * next send, not the one active when the screen first mounted.
 *
 * Kept in its own file (not chatLocale.test.ts) because jest.mock is hoisted
 * file-wide: mocking '@edutu/core/src/services/chat' and '.../chatStream'
 * here would silently swap out the real implementations chatLocale.test.ts
 * exercises for the request-body assertions. chatStreamFallback.test.ts
 * follows the same split for the same reason.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useChat } from '@edutu/core/src/hooks/useChat';
import { sendChatMessage } from '@edutu/core/src/services/chat';
import { ChatStreamUnavailableError, streamChatMessage } from '@edutu/core/src/services/chatStream';

jest.mock('@edutu/core/src/services/chat', () => {
  const actual = jest.requireActual('@edutu/core/src/services/chat');
  return {
    ...actual,
    fetchChatThreads: jest.fn().mockResolvedValue([]),
    fetchChatMessages: jest.fn().mockResolvedValue([]),
    sendChatMessage: jest.fn(),
    archiveChatThread: jest.fn(),
    deleteChatThread: jest.fn(),
  };
});

jest.mock('@edutu/core/src/services/chatStream', () => {
  const actual = jest.requireActual('@edutu/core/src/services/chatStream');
  return { ...actual, streamChatMessage: jest.fn() };
});

const mockedStream = streamChatMessage as jest.MockedFunction<typeof streamChatMessage>;
const mockedSend = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
const supabase = {} as never;

function serverResult(content: string) {
  return {
    threadId: 'thread-1',
    userMessage: { id: 'u-1', role: 'user' as const, content: 'hi', created_at: '2026-07-20T00:00:00.000Z' },
    assistantMessage: { id: 'a-1', role: 'assistant' as const, content, created_at: '2026-07-20T00:00:01.000Z' },
  };
}

describe('useChat — carries the caller-supplied locale on every send', () => {
  beforeEach(() => {
    mockedStream.mockReset();
    mockedSend.mockReset();
  });

  it('forwards the locale prop into the stream options on send', async () => {
    mockedStream.mockResolvedValue(serverResult('Reply'));

    const { result } = renderHook(() =>
      useChat({ supabase, userId: 'user-1', getAuthToken: async () => 'token', locale: 'sw' }),
    );
    await waitFor(() => expect(result.current.isLoadingThreads).toBe(false));

    await act(async () => {
      await result.current.sendMessage('Nataka kufa'); // Swahili crisis phrasing
    });

    expect(mockedStream).toHaveBeenCalledTimes(1);
    expect(mockedStream.mock.calls[0][0]).toMatchObject({ locale: 'sw' });
  });

  // A mid-session language switch (Settings → Language) must be reflected on
  // the very next send — the whole point of reading it live rather than
  // caching it once at mount.
  it('reflects a language switch mid-session on the next send', async () => {
    mockedStream.mockResolvedValue(serverResult('Reply'));

    const { result, rerender } = renderHook(
      ({ locale }: { locale: string }) =>
        useChat({ supabase, userId: 'user-1', getAuthToken: async () => 'token', locale }),
      { initialProps: { locale: 'en' } },
    );
    await waitFor(() => expect(result.current.isLoadingThreads).toBe(false));

    await act(async () => {
      await result.current.sendMessage('First message');
    });
    expect(mockedStream.mock.calls[0][0]).toMatchObject({ locale: 'en' });

    // The user opens Settings and switches to Arabic mid-session.
    rerender({ locale: 'ar' });

    await act(async () => {
      await result.current.sendMessage('Second message');
    });
    expect(mockedStream.mock.calls[1][0]).toMatchObject({ locale: 'ar' });
  });

  it('also forwards locale to the non-streaming fallback send', async () => {
    mockedStream.mockRejectedValue(new ChatStreamUnavailableError('no expo/fetch in this test'));
    mockedSend.mockResolvedValue(serverResult('Fallback reply'));

    const { result } = renderHook(() =>
      useChat({ supabase, userId: 'user-1', getAuthToken: async () => 'token', locale: 'hi' }),
    );
    await waitFor(() => expect(result.current.isLoadingThreads).toBe(false));

    await act(async () => {
      await result.current.sendMessage('hi there');
    });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][1]).toMatchObject({ locale: 'hi' });
  });
});
