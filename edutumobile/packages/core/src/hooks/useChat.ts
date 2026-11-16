import { useState, useCallback, useEffect, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchChatThreads,
  fetchChatMessages,
  sendChatMessage,
  archiveChatThread,
  deleteChatThread,
  ChatRateLimitError,
} from '../services/chat';
import {
  ChatStreamAbortedError,
  ChatStreamInterruptedError,
  streamChatMessage,
} from '../services/chatStream';
import { ChatThread, ChatMessage, SendChatMessageResult } from '../types/chat';

export interface UseChatOptions {
  supabase: SupabaseClient;
  userId: string | null;
  getAuthToken?: () => Promise<string | null>;
  onSessionRecorded?: (topic: string) => void;
  /**
   * The app's current UI language, sourced live from i18next by the caller
   * (e.g. `getCurrentLanguage()`). Passed straight through to both send paths
   * so the backend's crisis-support reply lands in the language the user is
   * actually reading — not a stale cached preference. A language switch
   * mid-session is picked up on the very next send because this is read
   * fresh (not captured in a ref) on every render.
   */
  locale?: string | null;
}

export function useChat({ supabase, userId, getAuthToken, onSessionRecorded, locale }: UseChatOptions) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Starts true: the mount effect immediately fetches threads, so rendering
  // "loading" from the first frame avoids a synchronous setState in the effect.
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // True only while the SSE transport is actually in flight. `isSending` also
  // covers the non-streaming fallback send, which takes no abort signal — so
  // Stop is gated on this flag rather than on `isSending`, and the button is
  // never rendered in a state where pressing it would do nothing.
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live token buffer for the reply being generated. `null` = nothing
  // streaming; `''` = streaming but nothing renderable yet (pre-first-token, or
  // right after the discard rule cleared a pre-tool preamble).
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  // Id of the assistant message that was just streamed in — the UI uses it to
  // skip the typewriter reveal on text the user already watched arrive.
  const [streamedMessageId, setStreamedMessageId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasRecordedSessionRef = useRef(false);
  const getAuthTokenRef = useRef(getAuthToken);
  const onSessionRecordedRef = useRef(onSessionRecorded);

  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);

  useEffect(() => {
    onSessionRecordedRef.current = onSessionRecorded;
  }, [onSessionRecorded]);

  // Internal fetch with no synchronous setState so the mount effect can call
  // it directly; the public loadThreads below keeps the loading flip for
  // manual refresh callers (event-handler context).
  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchChatThreads(
        supabase,
        userId,
        getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      );
      setThreads(data);
    } catch {
      setThreads([]);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [supabase, userId]);

  const loadThreads = useCallback(async () => {
    if (!userId) {
      setThreads([]);
      return;
    }
    setIsLoadingThreads(true);
    setError(null);
    return fetchThreads();
  }, [userId, fetchThreads]);

  const loadMessages = useCallback(async (threadId: string) => {
    setIsLoadingMessages(true);
    setError(null);
    try {
      const data = await fetchChatMessages(
        supabase,
        threadId,
        getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      );
      setMessages(data);
      hasRecordedSessionRef.current = data.length > 0;
    } catch {
      setMessages([]);
      setError('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [supabase]);

  const selectThread = useCallback((threadId: string | null) => {
    setSelectedThreadId(threadId);
    if (threadId) {
      loadMessages(threadId);
    } else {
      setMessages([]);
      hasRecordedSessionRef.current = false;
    }
  }, [loadMessages]);

  const sendMessage = useCallback(async (content: string, topic?: string) => {
    if (!userId || !content.trim()) return;
    const trimmedContent = content.trim();

    if (!hasRecordedSessionRef.current && onSessionRecordedRef.current) {
      onSessionRecordedRef.current?.(topic || 'Custom question');
      hasRecordedSessionRef.current = true;
    }

    setIsSending(true);
    setError(null);
    setStreamedMessageId(null);
    setStreamingContent('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const optimisticUserMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      created_at: new Date().toISOString(),
      metadata: { optimistic: true },
    };

    setMessages(prev => [...prev, optimisticUserMessage]);

    const sendOptions = {
      threadId: selectedThreadId,
      message: trimmedContent,
      userId: userId,
      authToken: getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      locale,
    };

    // `turn.final` is authoritative: the streamed text is thrown away and the
    // server's own message objects are what gets rendered and persisted —
    // identical to the non-streaming path.
    const commit = async (result: SendChatMessageResult) => {
      if (!selectedThreadId) {
        setSelectedThreadId(result.threadId);
        await loadThreads();
      }
      setMessages(prev => [
        ...prev.filter(message => message.id !== optimisticUserMessage.id),
        result.userMessage,
        result.assistantMessage,
      ]);
      return result;
    };

    /**
     * Keeps a partial reply the user already watched arrive (stop pressed, or
     * the connection dropped mid-answer) instead of blanking the screen. The
     * optimistic user bubble stays: the message did reach the server.
     */
    const keepPartial = (
      content: string,
      reason: 'stopped' | 'interrupted',
      extra?: Partial<ChatMessage['metadata']>,
    ) => {
      setMessages(prev => [
        ...prev,
        {
          id: `local-assistant-${Date.now()}`,
          role: 'assistant' as const,
          content,
          created_at: new Date().toISOString(),
          metadata: { [reason]: true, ...extra },
        },
      ]);
    };

    try {
      let result: SendChatMessageResult;
      try {
        result = await streamChatMessage({
          ...sendOptions,
          signal: controller.signal,
          handlers: { onContent: setStreamingContent },
        });
      } catch (streamError) {
        // The stream is over one way or another: Stop can no longer do anything.
        setIsStreaming(false);
        // A real limit hit is the same answer on either transport — never
        // retried, so the user is not charged twice.
        if (streamError instanceof ChatRateLimitError) throw streamError;

        if (streamError instanceof ChatStreamAbortedError) {
          const partial = streamError.partialContent.trim();
          // Stopped before a single token arrived: the turn was still charged,
          // so say so rather than leaving a silent screen with no reply.
          if (partial) keepPartial(partial, 'stopped');
          else keepPartial('', 'stopped', { stoppedBeforeReply: true });
          return undefined;
        }

        // The stream was ESTABLISHED, which means the server accepted the
        // request, metered it and is running (or already ran) the turn — the
        // socket dying does not cancel any of that. Auto-re-sending here would
        // charge the user a second time and persist a duplicate user+assistant
        // pair (or, with no threadId yet, an orphan thread holding a
        // paid-for answer). So we NEVER auto-fall-back once established:
        // whatever arrived is kept, and re-asking is an explicit user tap.
        if (streamError instanceof ChatStreamInterruptedError) {
          const partial = streamError.partialContent.trim();
          if (partial) {
            keepPartial(partial, 'interrupted');
            return undefined;
          }
          // Nothing renderable arrived. Rethrow so the screen restores the
          // composer and shows its tap-to-retry banner — one tap, user
          // consented, never a silent second metered turn.
          throw streamError;
        }

        // Only the provably-never-accepted cases reach here
        // (`ChatStreamUnavailableError`: no token/base URL, no `expo/fetch`,
        // transport error, non-2xx, no readable body). Nothing was metered, so
        // the plain request/response send is safe and free of duplicates.
        setStreamingContent(null);
        result = await sendChatMessage(supabase, sendOptions);
        const committed = await commit(result);
        return committed;
      }

      setIsStreaming(false);
      setStreamedMessageId(result.assistantMessage?.id ?? null);
      return await commit(result);
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message');
      setMessages(prev => prev.filter(message => message.id !== optimisticUserMessage.id));
      throw err;
    } finally {
      abortRef.current = null;
      setStreamingContent(null);
      setIsStreaming(false);
      setIsSending(false);
    }
  }, [supabase, userId, selectedThreadId, loadThreads, locale]);

  /**
   * User-facing stop. Aborts the in-flight stream; `sendMessage` keeps whatever
   * text had arrived and clears the sending state in its `finally`, so the
   * composer can never be left stuck.
   */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const archiveThread = useCallback(async (threadId: string) => {
    try {
      await archiveChatThread(
        supabase,
        threadId,
        getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      );
      await loadThreads();
      if (selectedThreadId === threadId) {
        selectThread(null);
      }
    } catch (err) {
      console.error('Failed to archive thread:', err);
      setError('Failed to archive conversation');
    }
  }, [supabase, loadThreads, selectedThreadId, selectThread]);

  const removeThread = useCallback(async (threadId: string) => {
    try {
      await deleteChatThread(
        supabase,
        threadId,
        getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      );
      await loadThreads();
      if (selectedThreadId === threadId) {
        selectThread(null);
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
      setError('Failed to delete conversation');
    }
  }, [supabase, loadThreads, selectedThreadId, selectThread]);

  // Clear chat state the moment the user signs out — adjust-during-render
  // (React's documented alternative to a state-resetting effect).
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setThreads([]);
      setSelectedThreadId(null);
      setMessages([]);
    }
  }

  useEffect(() => {
    if (userId) {
      fetchThreads();
    } else {
      hasRecordedSessionRef.current = false;
    }
  }, [userId, fetchThreads]);

  return {
    threads,
    messages,
    selectedThreadId,
    // Never report "loading" while signed out — the mount effect only fetches
    // when a user is present.
    isLoadingThreads: userId ? isLoadingThreads : false,
    isLoadingMessages,
    isSending,
    isStreaming,
    streamingContent,
    streamedMessageId,
    stopGeneration,
    error,
    loadThreads,
    loadMessages,
    selectThread,
    sendMessage,
    archiveThread,
    removeThread
  };
}
