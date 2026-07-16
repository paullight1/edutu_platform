import { useState, useCallback, useEffect, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchChatThreads,
  fetchChatMessages,
  sendChatMessage,
  archiveChatThread,
  deleteChatThread
} from '../services/chat';
import { ChatThread, ChatMessage } from '../types/chat';

export interface UseChatOptions {
  supabase: SupabaseClient;
  userId: string | null;
  getAuthToken?: () => Promise<string | null>;
  onSessionRecorded?: (topic: string) => void;
}

export function useChat({ supabase, userId, getAuthToken, onSessionRecorded }: UseChatOptions) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Starts true: the mount effect immediately fetches threads, so rendering
  // "loading" from the first frame avoids a synchronous setState in the effect.
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const optimisticUserMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      created_at: new Date().toISOString(),
      metadata: { optimistic: true },
    };

    setMessages(prev => [...prev, optimisticUserMessage]);

    try {
      const result = await sendChatMessage(supabase, {
        threadId: selectedThreadId,
        message: trimmedContent,
        userId: userId,
        authToken: getAuthTokenRef.current ? await getAuthTokenRef.current() : null,
      });

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
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message');
      setMessages(prev => prev.filter(message => message.id !== optimisticUserMessage.id));
      throw err;
    } finally {
      setIsSending(false);
    }
  }, [supabase, userId, selectedThreadId, loadThreads]);

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
    error,
    loadThreads,
    loadMessages,
    selectThread,
    sendMessage,
    archiveThread,
    removeThread
  };
}
