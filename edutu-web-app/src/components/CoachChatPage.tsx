import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Download,
  ExternalLink,
  FileText,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteChatThread,
  exportChatDocument,
  fetchChatMessages,
  fetchChatThreads,
  sendChatMessage,
  type ChatActionButton,
  type ChatDocumentCard,
  type ChatImageCard,
  type ChatMessage,
  type ChatThread,
  type OpportunityCard,
} from "../services/chat";
import { isUpgradeRequiredError } from "../services/productApi";
import { cn } from "../lib/cn";

/**
 * Messages launched from an opportunity on mobile carry a hidden context block
 * joined with this sentinel; strip it so resumed threads render cleanly here.
 */
const CHAT_CONTEXT_SENTINEL = "⁣⁣EDUTU_CTX⁣⁣";

function stripChatContext(content: string): string {
  const idx = content.indexOf(CHAT_CONTEXT_SENTINEL);
  return idx === -1 ? content : content.slice(0, idx).trimEnd();
}

const QUICK_PROMPTS = [
  "Recommend opportunities for me",
  "Spin me an opportunity",
  "Help me draft a CV",
  "What deadlines are coming up for me?",
];

/** Mobile agent routes → their web equivalents. */
const ROUTE_MAP: Record<string, string> = {
  "/goals": "/app/goals",
  "/roadmaps": "/app/roadmaps",
  "/opportunities": "/app/opportunities",
  "/deadlines": "/app/deadlines",
};

function formatDeadline(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatThreadDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function matchPercent(score: number | null | undefined): number | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const percent = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

const DOC_TYPE_LABELS: Record<ChatDocumentCard["type"], string> = {
  cv: "CV",
  sop: "Statement of purpose",
  cover_letter: "Cover letter",
  essay: "Essay",
};

export default function CoachChatPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const [searchParams] = useSearchParams();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const localIdRef = useRef(0);
  const prefillSeededRef = useRef(false);
  const bootRef = useRef(false);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) {
      throw new Error("Your session has expired. Sign in again to chat.");
    }
    return token;
  }, [getToken]);

  // Seed the composer from ?prefill= (coach pulse deep links) — never auto-send.
  useEffect(() => {
    if (prefillSeededRef.current) return;
    const prefill = searchParams.get("prefill");
    if (prefill && prefill.trim()) {
      prefillSeededRef.current = true;
      setInput((current) => current || prefill.trim());
      inputRef.current?.focus();
    }
  }, [searchParams]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      setMessagesLoading(true);
      setError(null);
      try {
        const token = await resolveToken();
        setMessages(await fetchChatMessages(threadId, token));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this conversation.",
        );
      } finally {
        setMessagesLoading(false);
      }
    },
    [resolveToken],
  );

  const refreshThreads = useCallback(async () => {
    try {
      const token = await resolveToken();
      setThreads(await fetchChatThreads(token));
    } catch {
      // Thread list refresh is cosmetic — the conversation itself already updated.
    }
  }, [resolveToken]);

  // Boot: load threads and resume the most recent conversation (matches mobile).
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    void (async () => {
      setThreadsLoading(true);
      try {
        const token = await resolveToken();
        const list = await fetchChatThreads(token);
        setThreads(list);
        if (list.length > 0) {
          setActiveThreadId(list[0].id);
          await loadMessages(list[0].id);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your conversations.",
        );
      } finally {
        setThreadsLoading(false);
      }
    })();
  }, [loadMessages, resolveToken]);

  // Keep the newest message in view.
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const selectThread = useCallback(
    (threadId: string) => {
      setHistoryOpen(false);
      if (threadId === activeThreadId) return;
      setActiveThreadId(threadId);
      setMessages([]);
      void loadMessages(threadId);
    },
    [activeThreadId, loadMessages],
  );

  const startNewChat = useCallback(() => {
    setHistoryOpen(false);
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
    setUpgradeNeeded(false);
    inputRef.current?.focus();
  }, []);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const confirmed = window.confirm(
        "Delete this conversation? This cannot be undone.",
      );
      if (!confirmed) return;
      try {
        const token = await resolveToken();
        await deleteChatThread(threadId, token);
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
        if (threadId === activeThreadId) startNewChat();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to delete the conversation.",
        );
      }
    },
    [activeThreadId, resolveToken, startNewChat],
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const message = (text ?? input).trim();
      if (!message || sending) return;

      setInput("");
      setError(null);
      setUpgradeNeeded(false);

      localIdRef.current += 1;
      const optimistic: ChatMessage = {
        id: `local-${localIdRef.current}`,
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);

      try {
        const token = await resolveToken();
        const result = await sendChatMessage(
          { threadId: activeThreadId, message },
          token,
        );
        setActiveThreadId(result.threadId);
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== optimistic.id),
          result.userMessage,
          result.assistantMessage,
        ]);
        void refreshThreads();
      } catch (sendError) {
        setMessages((prev) => prev.filter((item) => item.id !== optimistic.id));
        setInput((current) => current || message);
        if (isUpgradeRequiredError(sendError)) {
          setUpgradeNeeded(true);
        } else {
          setError(
            sendError instanceof Error
              ? sendError.message
              : "Message failed to send. Try again.",
          );
        }
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, input, refreshThreads, resolveToken, sending],
  );

  // One-tap chips under agent replies. Navigation kinds route directly;
  // creation kinds go back through chat so the agent runs the real tool.
  const handleActionButton = useCallback(
    (button: ChatActionButton) => {
      switch (button.kind) {
        case "open_route": {
          const route =
            typeof button.payload?.route === "string"
              ? button.payload.route
              : null;
          if (route) navigate(ROUTE_MAP[route] ?? route);
          break;
        }
        case "view_opportunity": {
          const id =
            typeof button.payload?.opportunityId === "string"
              ? button.payload.opportunityId
              : null;
          if (id) navigate(`/app/opportunity/${encodeURIComponent(id)}`);
          break;
        }
        case "spin_again":
          void handleSend("Spin me another opportunity!");
          break;
        case "create_goals":
          void handleSend("Yes — turn those milestones into goals for me.");
          break;
        case "create_roadmap":
          void handleSend("Yes, build me that roadmap.");
          break;
      }
    },
    [handleSend, navigate],
  );

  const handleExportDocument = useCallback(
    async (doc: ChatDocumentCard, format: "pdf" | "docx") => {
      const key = `${doc.docId}:${format}`;
      if (exportingKey) return;
      setExportingKey(key);
      setError(null);
      try {
        const token = await resolveToken();
        const result = await exportChatDocument(doc.docId, format, token);
        window.open(result.url, "_blank", "noopener");
      } catch (exportError) {
        if (isUpgradeRequiredError(exportError)) {
          setUpgradeNeeded(true);
        } else {
          setError(
            exportError instanceof Error
              ? exportError.message
              : "Export failed. Try again.",
          );
        }
      } finally {
        setExportingKey(null);
      }
    },
    [exportingKey, resolveToken],
  );

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages],
  );
  const showEmptyState =
    !messagesLoading && visibleMessages.length === 0 && !sending;

  const threadList = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-subtle p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Conversations
        </p>
        <button
          type="button"
          onClick={startNewChat}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-700"
        >
          <Plus size={14} />
          New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {threadsLoading ? (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-text-muted">
            No conversations yet. Ask the coach anything to get started.
          </p>
        ) : (
          <ul className="space-y-1">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              return (
                <li key={thread.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectThread(thread.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 pr-10 text-left transition",
                      active
                        ? "bg-brand-500/10 text-brand-700"
                        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="truncate text-sm font-semibold">
                      {thread.title || "New conversation"}
                    </span>
                    <span className="text-[11px] font-medium text-text-muted">
                      {formatThreadDate(
                        thread.last_message_at || thread.updated_at,
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteThread(thread.id)}
                    className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition hover:bg-danger/10 hover:text-danger group-hover:flex"
                    aria-label={`Delete conversation ${thread.title || ""}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] min-h-0 bg-surface-body text-text-primary lg:h-[100dvh]">
      {/* Threads sidebar (desktop) */}
      <aside className="hidden w-72 shrink-0 border-r border-subtle bg-surface-layer lg:block">
        {threadList}
      </aside>

      {/* Threads overlay (mobile) */}
      {historyOpen ? (
        <div className="fixed inset-0 z-[60] flex lg:hidden">
          <div className="flex h-full w-[85%] max-w-sm flex-col border-r border-subtle bg-surface-layer shadow-xl">
            <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
              <p className="text-sm font-semibold">Chat history</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated"
                aria-label="Close chat history"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">{threadList}</div>
          </div>
          <button
            type="button"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
            className="flex-1 bg-black/40"
          />
        </div>
      ) : null}

      {/* Chat column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-subtle bg-surface-layer/90 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">
                Edutu AI Coach
              </h1>
              <p className="truncate text-xs text-text-muted">
                Opportunities, roadmaps, goals, CVs — just ask.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated lg:hidden"
            >
              <History size={16} />
              History
            </button>
            <button
              type="button"
              onClick={startNewChat}
              className="hidden h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated lg:inline-flex"
            >
              <Plus size={16} />
              New chat
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                Loading conversation…
              </div>
            ) : null}

            {showEmptyState ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                  <MessageCircle size={26} />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Hey! I'm your opportunity coach.
                  </h2>
                  <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
                    I can find opportunities that fit you, build roadmaps and
                    goals, and draft standout CVs and SOPs.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleSend(prompt)}
                      className="rounded-full border border-subtle bg-surface-layer px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {visibleMessages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                sending={sending}
                exportingKey={exportingKey}
                onOpenOpportunity={(id) =>
                  navigate(`/app/opportunity/${encodeURIComponent(id)}`)
                }
                onActionButton={handleActionButton}
                onExportDocument={handleExportDocument}
              />
            ))}

            {sending ? (
              <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-subtle bg-surface-layer px-4 py-3">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
                    style={{ animationDelay: `${dot * 150}ms` }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {upgradeNeeded ? (
          <div className="border-t border-brand/20 bg-brand/5 px-4 py-3">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-brand-700">
                You've used today's free AI messages.
              </p>
              <button
                type="button"
                onClick={() => navigate("/app/wallet")}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
              >
                Get more credits
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="border-t border-danger/20 bg-danger/5 px-4 py-2.5">
            <p className="mx-auto max-w-3xl text-sm font-semibold text-danger">
              {error}
            </p>
          </div>
        ) : null}

        <footer className="border-t border-subtle bg-surface-layer px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask your coach anything…"
              rows={1}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-2.5 text-sm leading-6 text-text-primary placeholder:text-text-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  sending: boolean;
  exportingKey: string | null;
  onOpenOpportunity: (id: string) => void;
  onActionButton: (button: ChatActionButton) => void;
  onExportDocument: (doc: ChatDocumentCard, format: "pdf" | "docx") => void;
}

function MessageRow({
  message,
  sending,
  exportingKey,
  onOpenOpportunity,
  onActionButton,
  onExportDocument,
}: MessageRowProps) {
  const isUser = message.role === "user";
  const content = isUser ? stripChatContext(message.content) : message.content;
  const metadata = message.metadata ?? undefined;
  const opportunities = metadata?.opportunities ?? [];
  const actionButtons = metadata?.actionButtons ?? [];
  const documents = metadata?.documents ?? [];
  const images = metadata?.images ?? [];
  const hasCalendarAction = (metadata?.deviceActions ?? []).some(
    (action) => action.type === "calendar.sync",
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      {content.trim() ? (
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 sm:max-w-[75%]",
            isUser
              ? "rounded-br-md bg-brand text-white"
              : "rounded-bl-md border border-subtle bg-surface-layer text-text-primary",
          )}
        >
          {content}
        </div>
      ) : null}

      {opportunities.length > 0 ? (
        <div className="flex w-full max-w-[95%] flex-col gap-2 sm:max-w-[85%]">
          {opportunities.map((opportunity) => (
            <OpportunityChatCard
              key={opportunity.id}
              opportunity={opportunity}
              onOpen={() => onOpenOpportunity(opportunity.id)}
            />
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="flex w-full max-w-[95%] flex-wrap gap-2 sm:max-w-[85%]">
          {images.map((image) => (
            <ImageChatCard key={image.opportunityId} image={image} />
          ))}
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className="flex w-full max-w-[95%] flex-col gap-2 sm:max-w-[85%]">
          {documents.map((doc) => (
            <DocumentChatCard
              key={`${doc.docId}-${doc.version}`}
              doc={doc}
              exportingKey={exportingKey}
              onExport={onExportDocument}
            />
          ))}
        </div>
      ) : null}

      {hasCalendarAction ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <CalendarPlus size={13} />
          Open the Edutu mobile app to sync these milestones to your calendar.
        </p>
      ) : null}

      {actionButtons.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actionButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              disabled={sending}
              onClick={() => onActionButton(button)}
              className="rounded-full border border-brand/30 bg-brand/5 px-3.5 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {button.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OpportunityChatCard({
  opportunity,
  onOpen,
}: {
  opportunity: OpportunityCard;
  onOpen: () => void;
}) {
  const deadline = formatDeadline(opportunity.deadline);
  const percent = matchPercent(opportunity.matchScore);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-stretch gap-3 rounded-2xl border border-subtle bg-surface-layer p-3 text-left shadow-sm transition hover:border-brand/40 hover:bg-surface-elevated active:scale-[0.99]"
    >
      {opportunity.imageUrl ? (
        <img
          src={opportunity.imageUrl}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-5">
            {opportunity.title}
          </p>
          {percent !== null ? (
            <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-700">
              {percent}% match
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs font-medium text-text-muted">
          {[opportunity.organization, opportunity.location]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {opportunity.category ? (
            <span className="text-text-secondary">{opportunity.category}</span>
          ) : null}
          {deadline ? (
            <span className="text-text-muted">Due {deadline}</span>
          ) : null}
        </div>
        {opportunity.matchReason ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
            {opportunity.matchReason}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function DocumentChatCard({
  doc,
  exportingKey,
  onExport,
}: {
  doc: ChatDocumentCard;
  exportingKey: string | null;
  onExport: (doc: ChatDocumentCard, format: "pdf" | "docx") => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-subtle bg-surface-layer p-3 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
        <FileText size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{doc.title}</p>
        <p className="text-xs font-medium text-text-muted">
          {DOC_TYPE_LABELS[doc.type] ?? doc.type} · v{doc.version}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-700"
          >
            <Download size={14} />
            {doc.format ? doc.format.toUpperCase() : "Download"}
          </a>
        ) : (
          (["pdf", "docx"] as const).map((format) => {
            const busy = exportingKey === `${doc.docId}:${format}`;
            return (
              <button
                key={format}
                type="button"
                disabled={Boolean(exportingKey)}
                onClick={() => onExport(doc, format)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-subtle px-3 text-xs font-bold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}
                {format.toUpperCase()}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ImageChatCard({ image }: { image: ChatImageCard }) {
  return (
    <a
      href={image.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-56 overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-sm transition hover:border-brand/40"
    >
      <img
        src={image.url}
        alt={`Share card for ${image.title}`}
        loading="lazy"
        className="aspect-[4/5] w-full object-cover"
      />
      <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-text-secondary">
        <span className="truncate">{image.title}</span>
        <ExternalLink
          size={13}
          className="shrink-0 text-text-muted transition group-hover:text-brand"
        />
      </span>
    </a>
  );
}
