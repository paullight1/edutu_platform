import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Briefcase,
  CalendarClock,
  Clock,
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  deleteChatThread,
  fetchChatMessages,
  fetchChatThreads,
  sendChatMessage,
  type ChatMessage,
  type ChatThread,
  type OpportunityCard,
} from '../services/chat';
import ImageWithFallback from './ImageWithFallback';

function formatThreadDate(value?: string | null) {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';

  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDeadline(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function normalizeScore(score: number | null) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score > 1 ? Math.round(score) : Math.round(score * 100);
}

function getMessageOpportunities(message: ChatMessage): OpportunityCard[] {
  const opportunities = message.metadata?.opportunities;
  if (!Array.isArray(opportunities)) return [];
  return opportunities.filter(
    (item): item is OpportunityCard =>
      Boolean(item && typeof item.id === 'string' && typeof item.title === 'string'),
  );
}

export default function CoachPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { isDarkMode } = useDarkMode();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) {
      throw new Error('Your session has expired. Sign in again to use Coach.');
    }
    return token;
  }, [getToken]);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    setError(null);

    try {
      const token = await resolveToken();
      const nextThreads = await fetchChatThreads(token);
      setThreads(nextThreads);
      setActiveThreadId((current) => current ?? nextThreads[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load conversations.');
    } finally {
      setLoadingThreads(false);
    }
  }, [resolveToken]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    let isCurrent = true;

    if (!activeThreadId) {
      setMessages([]);
      setLoadingMessages(false);
      return () => {
        isCurrent = false;
      };
    }

    const threadId = activeThreadId;

    async function loadMessages() {
      setLoadingMessages(true);
      setError(null);

      try {
        const token = await resolveToken();
        const nextMessages = await fetchChatMessages(threadId, token);
        if (isCurrent) setMessages(nextMessages);
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load this conversation.');
        }
      } finally {
        if (isCurrent) setLoadingMessages(false);
      }
    }

    void loadMessages();

    return () => {
      isCurrent = false;
    };
  }, [activeThreadId, resolveToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending]);

  const startNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setDraft('');
    setError(null);
    setDeletingThreadId(null);
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text || sending) return;

    const optimisticMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      metadata: null,
    };

    setDraft('');
    setMessages((current) => [...current, optimisticMessage]);
    setSending(true);
    setError(null);

    try {
      const token = await resolveToken();
      const result = await sendChatMessage(
        { threadId: activeThreadId, message: text },
        token,
      );

      const savedMessages = [result.userMessage, result.assistantMessage].filter(
        Boolean,
      ) as ChatMessage[];

      setActiveThreadId(result.threadId);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticMessage.id),
        ...savedMessages,
      ]);
      setThreads(await fetchChatThreads(token));
    } catch (sendError) {
      setDraft(text);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
      setError(sendError instanceof Error ? sendError.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleDeleteThread = async (threadId: string) => {
    if (deletingThreadId !== threadId) {
      setDeletingThreadId(threadId);
      return;
    }

    setDeletingThreadId(null);
    setError(null);

    try {
      const token = await resolveToken();
      await deleteChatThread(threadId, token);
      const nextThreads = threads.filter((thread) => thread.id !== threadId);
      setThreads(nextThreads);
      if (activeThreadId === threadId) {
        setActiveThreadId(nextThreads[0]?.id ?? null);
        if (nextThreads.length === 0) setMessages([]);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete conversation.');
    }
  };

  const openOpportunity = (id: string) => {
    navigate(`/opportunity/${id}`);
  };

  const openApplyLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const promptChips = [
    'Find scholarships that match my profile',
    'Help me plan this week of applications',
    'Review what I should do before a deadline',
  ];

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft size={17} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={startNewThread}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <Plus size={17} />
            New chat
          </button>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        <aside className={`rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className={`flex items-center justify-between border-b p-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <MessageCircle size={20} />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight">Coach</h1>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {threads.length} conversations
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadThreads}
              disabled={loadingThreads}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Refresh conversations"
            >
              {loadingThreads ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            </button>
          </div>

          <div className="max-h-[260px] overflow-y-auto p-3 lg:max-h-[calc(100dvh-9rem)]">
            {loadingThreads ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-[72px] animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/10" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                No conversations yet.
              </div>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => {
                  const active = thread.id === activeThreadId;
                  const confirmingDelete = deletingThreadId === thread.id;

                  return (
                    <div
                      key={thread.id}
                      className={`group rounded-2xl border transition ${
                        active
                          ? 'border-brand-500/30 bg-brand-500/10'
                          : isDarkMode
                            ? 'border-white/10 bg-white/5 hover:bg-white/10'
                            : 'border-slate-200 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveThreadId(thread.id);
                          setDeletingThreadId(null);
                        }}
                        className="w-full p-3 text-left"
                        aria-current={active ? 'page' : undefined}
                      >
                        <p className="line-clamp-2 text-sm font-black">
                          {thread.title || 'Untitled conversation'}
                        </p>
                        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <Clock size={13} />
                          {formatThreadDate(thread.updated_at || thread.last_message_at)}
                        </p>
                      </button>
                      <div className="flex justify-end px-2 pb-2">
                        <button
                          type="button"
                          onClick={() => void handleDeleteThread(thread.id)}
                          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold transition ${
                            confirmingDelete
                              ? 'bg-red-500 text-white'
                              : 'text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-300'
                          }`}
                          aria-label={confirmingDelete ? 'Confirm delete conversation' : 'Delete conversation'}
                        >
                          <Trash2 size={13} />
                          {confirmingDelete ? 'Confirm' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className={`flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className={`border-b p-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white">
                <Bot size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black tracking-tight">
                  {activeThread?.title || 'New coach conversation'}
                </h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Scholarship, CV, deadline, and career guidance
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {error ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {loadingMessages ? (
              <div className="space-y-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className={`h-20 animate-pulse rounded-2xl ${item % 2 ? 'ml-auto w-2/3 bg-brand-500/20' : 'w-3/4 bg-slate-200/70 dark:bg-white/10'}`} />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[48dvh] items-center justify-center">
                <div className="w-full max-w-2xl text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Bot size={26} />
                  </div>
                  <h3 className="mt-4 text-2xl font-black tracking-tight">Start with the next decision</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-400">
                    Ask about real opportunities, application steps, CV priorities, deadlines, or weekly planning.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {promptChips.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void handleSend(prompt)}
                        disabled={sending}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-brand-500/40 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  const opportunities = getMessageOpportunities(message);

                  return (
                    <article
                      key={message.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[min(760px,100%)] ${isUser ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                            isUser
                              ? 'bg-brand-500 text-white'
                              : isDarkMode
                                ? 'border border-white/10 bg-white/5 text-slate-100'
                                : 'border border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        </div>

                        {opportunities.length > 0 ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {opportunities.map((opportunity) => {
                              const deadline = formatDeadline(opportunity.deadline);
                              const score = normalizeScore(opportunity.matchScore);

                              return (
                                <div
                                  key={opportunity.id}
                                  className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-white/10 bg-gray-950' : 'border-slate-200 bg-white'}`}
                                >
                                  <ImageWithFallback
                                    src={opportunity.imageUrl || ''}
                                    alt={opportunity.title}
                                    className="h-28 w-full object-cover"
                                    fallbackIcon="building"
                                    fallbackClassName="h-28 w-full bg-slate-100 dark:bg-white/5"
                                  />
                                  <div className="p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="line-clamp-2 text-sm font-black">
                                          {opportunity.title}
                                        </p>
                                        <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                          {opportunity.organization || opportunity.category || 'Opportunity'}
                                        </p>
                                      </div>
                                      {score !== null ? (
                                        <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                                          {score}%
                                        </span>
                                      ) : null}
                                    </div>
                                    {opportunity.summary ? (
                                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
                                        {opportunity.summary}
                                      </p>
                                    ) : null}
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                      {opportunity.location ? (
                                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                                          <Briefcase size={12} />
                                          {opportunity.location}
                                        </span>
                                      ) : null}
                                      {deadline ? (
                                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                                          <CalendarClock size={12} />
                                          {deadline}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      <button
                                        type="button"
                                        onClick={() => openOpportunity(opportunity.id)}
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                                      >
                                        <Briefcase size={14} />
                                        Details
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => opportunity.applyUrl && openApplyLink(opportunity.applyUrl)}
                                        disabled={!opportunity.applyUrl}
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 text-xs font-black text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        <ExternalLink size={14} />
                                        Apply
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {sending ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                      <Loader2 size={16} className="animate-spin" />
                      Thinking
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form
            className={`border-t p-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <label htmlFor="coach-message" className="sr-only">
              Message Coach
            </label>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-gray-950">
              <textarea
                id="coach-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                placeholder="Ask Coach about an application, deadline, CV, or scholarship"
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm font-semibold outline-none placeholder:text-slate-400 dark:text-white"
              />
              <button
                type="submit"
                disabled={sending || draft.trim().length === 0}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
