import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useChat } from '@edutu/core/src/hooks/useChat';
import { ChatRateLimitError, sendChatMessage } from '@edutu/core/src/services/chat';
import {
  ChatStreamAbortedError,
  ChatStreamInterruptedError,
  ChatStreamUnavailableError,
  streamChatMessage,
} from '@edutu/core/src/services/chatStream';

// jest.mock calls are hoisted above these imports by babel-jest.

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
    userMessage: { id: 'u-1', role: 'user' as const, content: 'Any scholarships?', created_at: '2026-07-20T00:00:00.000Z' },
    assistantMessage: { id: 'a-1', role: 'assistant' as const, content, created_at: '2026-07-20T00:00:01.000Z' },
  };
}

async function mountChat() {
  const view = renderHook(() =>
    useChat({ supabase, userId: 'user-1', getAuthToken: async () => 'token' }),
  );
  await waitFor(() => expect(view.result.current.isLoadingThreads).toBe(false));
  return view;
}

describe('useChat streaming', () => {
  beforeEach(() => {
    mockedStream.mockReset();
    mockedSend.mockReset();
  });

  it('renders streamed tokens and commits the authoritative turn.final message', async () => {
    mockedStream.mockImplementation(async (options) => {
      options.handlers?.onContent?.('I found');
      options.handlers?.onContent?.('I found 3 matches');
      return serverResult('I found 3 matches.');
    });

    const { result } = await mountChat();
    await act(async () => {
      await result.current.sendMessage('Any scholarships?');
    });

    // The rendered reply is the server's own message object, not the buffer.
    expect(result.current.messages.map((m) => m.content)).toEqual([
      'Any scholarships?',
      'I found 3 matches.',
    ]);
    expect(result.current.streamingContent).toBeNull();
    expect(result.current.streamedMessageId).toBe('a-1');
    expect(result.current.isSending).toBe(false);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('falls back to the non-streaming send when the stream cannot be established', async () => {
    mockedStream.mockRejectedValue(new ChatStreamUnavailableError('no body'));
    mockedSend.mockResolvedValue(serverResult('Fallback answer.'));

    const { result } = await mountChat();
    await act(async () => {
      await result.current.sendMessage('Any scholarships?');
    });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][1]).toMatchObject({
      message: 'Any scholarships?',
      userId: 'user-1',
      authToken: 'token',
    });
    // The user's message is never lost and they still get an answer.
    expect(result.current.messages.map((m) => m.content)).toEqual([
      'Any scholarships?',
      'Fallback answer.',
    ]);
    // Fallback text was not streamed, so the typewriter is still allowed.
    expect(result.current.streamedMessageId).toBeNull();
    expect(result.current.isSending).toBe(false);
  });

  // REGRESSION: the stream is metered the moment the server accepts it, and
  // `turn.start` arrives long before any AI work — so an interruption with an
  // empty buffer (the common case: the whole pre-first-token / tool-calling
  // phase) used to auto-re-send, charging the user twice and persisting a
  // duplicate user+assistant pair, or a whole orphan thread on a new chat.
  it('never auto-re-sends an interrupted stream that produced nothing — it surfaces retry instead', async () => {
    mockedStream.mockRejectedValue(new ChatStreamInterruptedError(''));
    mockedSend.mockResolvedValue(serverResult('Fallback answer.'));

    const { result } = await mountChat();
    await act(async () => {
      await expect(result.current.sendMessage('Any scholarships?')).rejects.toBeInstanceOf(
        ChatStreamInterruptedError,
      );
    });

    // No second metered turn, and no second persisted turn.
    expect(mockedSend).not.toHaveBeenCalled();
    // The optimistic bubble is rolled back so the screen can restore the text
    // to the composer and offer an explicit tap-to-retry.
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isSending).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingContent).toBeNull();
  });

  it('flags a stop that landed before the first token so the screen is never silent', async () => {
    mockedStream.mockRejectedValue(new ChatStreamAbortedError(''));

    const { result } = await mountChat();
    await act(async () => {
      await result.current.sendMessage('Any scholarships?');
    });

    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].metadata?.stoppedBeforeReply).toBe(true);
    expect(result.current.messages[1].content).toBe('');
  });

  it('reports isStreaming only while the SSE transport is in flight', async () => {
    mockedStream.mockRejectedValue(new ChatStreamUnavailableError('no body'));
    mockedSend.mockImplementation(() => new Promise(() => {}));

    const { result } = await mountChat();
    await act(async () => {
      void result.current.sendMessage('Any scholarships?');
    });

    // The fallback send takes no abort signal, so Stop must not be offered.
    expect(result.current.isSending).toBe(true);
    expect(result.current.isStreaming).toBe(false);
  });

  it('keeps the partial reply when the connection drops mid-answer instead of re-sending', async () => {
    mockedStream.mockRejectedValue(new ChatStreamInterruptedError('Chevening opens'));

    const { result } = await mountChat();
    await act(async () => {
      await result.current.sendMessage('Any scholarships?');
    });

    // Re-sending would spend a second AI turn and duplicate the user's message.
    expect(mockedSend).not.toHaveBeenCalled();
    expect(result.current.messages.map((m) => m.content)).toEqual([
      'Any scholarships?',
      'Chevening opens',
    ]);
    expect(result.current.messages[1].metadata?.interrupted).toBe(true);
    expect(result.current.isSending).toBe(false);
  });

  it('keeps what arrived when the user stops, and never leaves the UI sending', async () => {
    mockedStream.mockImplementation(async (options) => {
      options.handlers?.onContent?.('Chevening op');
      throw new ChatStreamAbortedError('Chevening op');
    });

    const { result } = await mountChat();
    await act(async () => {
      await result.current.sendMessage('Any scholarships?');
    });

    expect(result.current.messages.map((m) => m.content)).toEqual([
      'Any scholarships?',
      'Chevening op',
    ]);
    expect(result.current.messages[1].metadata?.stopped).toBe(true);
    expect(result.current.streamingContent).toBeNull();
    expect(result.current.isSending).toBe(false);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('stopGeneration aborts a stream that is still running', async () => {
    mockedStream.mockImplementation((options) => new Promise((_resolve, reject) => {
      options.handlers?.onContent?.('Chevening op');
      options.signal?.addEventListener('abort', () => {
        reject(new ChatStreamAbortedError('Chevening op'));
      });
    }));

    const { result } = await mountChat();
    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.sendMessage('Any scholarships?');
    });

    expect(result.current.isSending).toBe(true);
    expect(result.current.streamingContent).toBe('Chevening op');

    await act(async () => {
      result.current.stopGeneration();
      await pending;
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.messages[1].metadata?.stopped).toBe(true);
    expect(result.current.messages[1].content).toBe('Chevening op');
  });

  it('surfaces a rate limit instead of retrying it on the other transport', async () => {
    mockedStream.mockRejectedValue(new ChatRateLimitError());

    const { result } = await mountChat();
    await act(async () => {
      await expect(result.current.sendMessage('Any scholarships?')).rejects.toBeInstanceOf(
        ChatRateLimitError,
      );
    });

    expect(mockedSend).not.toHaveBeenCalled();
    // The optimistic bubble is rolled back so the composer can restore the text.
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isSending).toBe(false);
  });
});
