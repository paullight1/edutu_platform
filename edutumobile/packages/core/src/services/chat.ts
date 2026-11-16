import { SupabaseClient } from '@supabase/supabase-js';
import { ChatThread, ChatMessage, SendChatMessageResult } from '../types/chat';
import { requestProductApi } from './productApi';

const CHAT_PROXY_TIMEOUT_MS = 10000;
const CHAT_SEND_TIMEOUT_MS = 12000;

/** Screen the user is on when invoking the win-coach (inline action or assistant). */
export type ScreenContext = {
  surface?: string;
  opportunityId?: string;
  applicationId?: string;
  documentId?: string;
  uploadId?: string;
};

/** Inline-action intent preset understood by the backend agent. */
export type WinCoachIntent =
  | 'free_chat'
  | 'fit_check'
  | 'next_move'
  | 'review_doc'
  | 'whats_missing';

export type SendChatMessageOptions = {
  threadId?: string | null;
  message: string;
  userId: string;
  authToken?: string | null;
  channel?: 'text' | 'voice';
  context?: ScreenContext;
  intent?: WinCoachIntent;
  /**
   * The app's current UI language (e.g. "en", "sw"), sourced live from
   * i18next by the caller — never a stored preference, since the user can
   * switch language mid-session. The backend's crisis-support path replies
   * in this language (falling back to `Accept-Language`, then English); it is
   * optional and additive everywhere else.
   */
  locale?: string | null;
};

/**
 * Thrown when the backend rate-limits the user (HTTP 429). The chat UI surfaces
 * a distinct "message limit" message for this case instead of a generic failure.
 */
export class ChatRateLimitError extends Error {
  constructor(message = "You've hit the message limit, try again shortly.") {
    super(message);
    this.name = 'ChatRateLimitError';
  }
}

function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
}

/**
 * Direct backend POST for chat sends. Unlike requestProductApi (which returns
 * null on any non-2xx and swallows the status), this surfaces HTTP 429 as a
 * typed ChatRateLimitError so the UI can show the right message. Returns null on
 * other failures so callers can fall back to the supabase chat-proxy path.
 */
async function postChatMessageToBackend(
  options: SendChatMessageOptions,
): Promise<SendChatMessageResult | null> {
  const apiBaseUrl = getApiBaseUrl();
  const token = options.authToken;

  if (!apiBaseUrl || !token) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_SEND_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl}/chat/messages`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        threadId: options.threadId,
        message: options.message,
        userId: options.userId,
        channel: options.channel,
        // Win-coach screen context + intent — backend-only (the chat-proxy
        // fallback ignores these), so send them just on this path.
        ...(options.context ? { context: options.context } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
        ...(options.locale ? { locale: options.locale } : {}),
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new ChatRateLimitError();
    }

    if (!response.ok) {
      return null;
    }

    try {
      return await response.json() as SendChatMessageResult;
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Chat request timed out')), timeoutMs);
    }),
  ]);
}

function isMissingChatStoreError(error: any) {
  const code = error?.code || error?.details?.code;
  const message = String(error?.message || error?.context?.error || '').toLowerCase();

  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('chat_threads') ||
    message.includes('chat_messages') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function isRecoverableChatReadError(error: any) {
  const name = String(error?.name || '');
  const message = [
    error?.message,
    error?.context?.error,
    error?.details,
    error?.hint,
    error?.status,
  ].filter(Boolean).join(' ').toLowerCase();

  return (
    isMissingChatStoreError(error) ||
    name.toLowerCase().includes('functionshttperror') ||
    message.includes('functionshttperror') ||
    message.includes('edge function returned a non-2xx status code') ||
    message.includes('failed to load chat threads') ||
    message.includes('failed to load chat messages') ||
    message.includes('function') ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  );
}

export async function fetchChatThreads(supabase: SupabaseClient, userId?: string | null, authToken?: string | null): Promise<ChatThread[]> {
  try {
    const backendResult = await requestProductApi<{ threads: ChatThread[] }>(
      '/chat/threads',
      undefined,
      authToken ? async () => authToken : undefined,
    );

    if (backendResult) {
      return backendResult.threads ?? [];
    }
  } catch (error) {
    if (!isRecoverableChatReadError(error)) {
      return [];
    }
  }

  try {
    const { data, error } = await withTimeout(supabase.functions.invoke<{ threads: ChatThread[] }>('chat-proxy', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: {
        mode: 'threads',
        userId,
      },
    }), CHAT_PROXY_TIMEOUT_MS);

    if (error) {
      if (isRecoverableChatReadError(error)) return [];
      throw error;
    }

    return data?.threads ?? [];
  } catch {
    return [];
  }
}

export async function fetchChatMessages(supabase: SupabaseClient, threadId: string, authToken?: string | null): Promise<ChatMessage[]> {
  try {
    const backendResult = await requestProductApi<{ messages: ChatMessage[] }>(
      `/chat/threads/${encodeURIComponent(threadId)}/messages`,
      undefined,
      authToken ? async () => authToken : undefined,
    );

    if (backendResult) {
      return backendResult.messages ?? [];
    }
  } catch (error) {
    if (!isRecoverableChatReadError(error)) {
      return [];
    }
  }

  try {
    const { data, error } = await withTimeout(supabase.functions.invoke<{ messages: ChatMessage[] }>('chat-proxy', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: {
        mode: 'messages',
        threadId,
      },
    }), CHAT_PROXY_TIMEOUT_MS);

    if (error) {
      if (isRecoverableChatReadError(error)) return [];
      throw error;
    }

    return data?.messages ?? [];
  } catch {
    return [];
  }
}

export async function archiveChatThread(supabase: SupabaseClient, threadId: string, authToken?: string | null) {
  return deleteChatThread(supabase, threadId, authToken);
}

export async function deleteChatThread(supabase: SupabaseClient, threadId: string, authToken?: string | null) {
  const backendResult = await requestProductApi<{ success: boolean }>(
    `/chat/threads/${encodeURIComponent(threadId)}`,
    { method: 'DELETE' },
    authToken ? async () => authToken : undefined,
  );

  if (backendResult) {
    return;
  }

  const { error } = await supabase.functions.invoke<{ success: boolean }>('chat-proxy', {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: {
      mode: 'delete-thread',
      threadId,
    },
  });

  if (error) {
    throw error;
  }
}

export async function renameChatThread(supabase: SupabaseClient, threadId: string, title: string) {
  const { error } = await supabase
    .from('chat_threads')
    .update({ title })
    .eq('id', threadId);

  if (error) {
    throw error;
  }
}

export async function sendChatMessage(
  supabase: SupabaseClient,
  options: SendChatMessageOptions
): Promise<SendChatMessageResult> {
  try {
    const backendResult = await postChatMessageToBackend(options);

    if (backendResult) return backendResult;

    // `locale` IS forwarded here: the chat-proxy edge function now runs the
    // shared multilingual crisis module (supabase/functions/_shared/
    // crisis-support.ts), so a self-harm message caught on this fallback path
    // is answered in the user's language with the crisis contact + directory,
    // matching the Nest /chat/messages behaviour. It is ignored for all
    // non-crisis turns.
    const { data, error } = await withTimeout(supabase.functions.invoke<SendChatMessageResult>('chat-proxy', {
      headers: options.authToken ? { Authorization: `Bearer ${options.authToken}` } : undefined,
      body: {
        threadId: options.threadId,
        message: options.message,
        userId: options.userId,
        channel: options.channel,
        ...(options.locale ? { locale: options.locale } : {}),
      },
    }), CHAT_PROXY_TIMEOUT_MS);

    if (!error && data) return data;
    throw error || new Error('No response from AI service');
  } catch (error) {
    console.error('Chat AI failure:', error);
    throw error;
  }
}
