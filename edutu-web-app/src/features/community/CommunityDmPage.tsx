import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useParams } from "react-router-dom";
import { ArrowDown, Loader2, MessageCircle, Send } from "lucide-react";
import Seo from "../../components/Seo";
import {
  CommunityDmApi,
  DM_MESSAGE_MAX_LENGTH,
  type DmConversationDetail,
  type DmMessage,
  type DmProfile,
} from "./dmApi";
import { subscribeToDmMessages, type DmRealtimeMessage } from "./dmRealtime";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import { formatCommunityTime } from "./format";

const PAGE_SIZE = 40;
const RECONCILIATION_INTERVAL_MS = 60_000;

function mergeMessages(current: DmMessage[], incoming: DmMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

function realtimeSender(
  event: DmRealtimeMessage,
  userId: string | null | undefined,
  conversation: DmConversationDetail | null,
): DmProfile {
  if (event.senderId === userId) {
    return { userId: event.senderId, displayName: "You", avatarUrl: null };
  }
  if (conversation?.otherUser.userId === event.senderId) {
    return conversation.otherUser;
  }
  return {
    userId: event.senderId,
    displayName: "Edutu member",
    avatarUrl: null,
  };
}

function hydrateRealtimeMessage(
  event: DmRealtimeMessage,
  userId: string | null | undefined,
  conversation: DmConversationDetail | null,
): DmMessage {
  return {
    ...event,
    sender: realtimeSender(event, userId, conversation),
  };
}

export default function CommunityDmPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityDmApi(getToken), [getToken]);
  const [conversation, setConversation] = useState<DmConversationDetail | null>(
    null,
  );
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<DmConversationDetail | null>(null);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const prependPositionRef = useRef<{ height: number; top: number } | null>(null);
  const [showLatestButton, setShowLatestButton] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [detail, page] = await Promise.all([
          api.getConversation(id),
          api.listMessages(id, { limit: PAGE_SIZE }),
        ]);
        setConversation(detail);
        // Merge instead of replace: an INSERT may arrive while the authorized
        // API reconciliation request is in flight.
        setMessages((current) => mergeMessages(current, page));
        setHasMore(page.length >= PAGE_SIZE);
        void api.markRead(id).catch(() => undefined);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "This conversation is unavailable.",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, id],
  );

  useEffect(() => {
    conversationRef.current = null;
    stickToLatestRef.current = true;
    prependPositionRef.current = null;
    setShowLatestButton(false);
    setConversation(null);
    setMessages([]);
    setHasMore(true);
    setDraft("");
    setError(null);
    void load(false);
  }, [id, load]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Keep the latest message visible without pulling readers away from older ones.
  // Restore the viewport position when an earlier page is prepended.
  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const previous = prependPositionRef.current;
    if (previous) {
      viewport.scrollTop = previous.top + viewport.scrollHeight - previous.height;
      prependPositionRef.current = null;
    } else if (stickToLatestRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, loading]);

  const onMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const nearLatest = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 96;
    stickToLatestRef.current = nearLatest;
    setShowLatestButton(!nearLatest && messages.length > 0);
  };

  const scrollToLatest = () => {
    const viewport = messageViewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    stickToLatestRef.current = true;
    setShowLatestButton(false);
  };

  useEffect(() => {
    const unsubscribe = subscribeToDmMessages(id, (event) => {
      const hydrated = hydrateRealtimeMessage(
        event,
        userId,
        conversationRef.current,
      );
      setMessages((current) => mergeMessages(current, [hydrated]));
      if (!stickToLatestRef.current) setShowLatestButton(true);
      setConversation((current) =>
        current ? { ...current, lastMessageAt: event.createdAt } : current,
      );
      if (event.senderId !== userId) {
        void api.markRead(id).catch(() => undefined);
      }
    });

    const reconciliation = window.setInterval(() => {
      void load(true);
    }, RECONCILIATION_INTERVAL_MS);

    return () => {
      window.clearInterval(reconciliation);
      unsubscribe();
    };
  }, [api, id, load, userId]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const page = await api.listMessages(id, {
        before: oldest.createdAt,
        beforeId: oldest.id,
        limit: PAGE_SIZE,
      });
      const viewport = messageViewportRef.current;
      if (viewport && page.length > 0) {
        prependPositionRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
      }
      setMessages((current) => mergeMessages(current, page));
      setHasMore(page.length >= PAGE_SIZE);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Older messages could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await api.sendMessage(id, body);
      stickToLatestRef.current = true;
      setShowLatestButton(false);
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  };

  const name = conversation?.otherUser.displayName ?? "Conversation";
  return (
    <>
      <Seo
        title={`${name} — Community chat | Edutu`}
        description="Private Edutu community conversation."
        path={`/app/community/dm/${id}`}
        noindex
      />
      <CommunityProductShell
        title={name}
        description="Private community conversation"
      >
        {loading ? (
          <CommunityState kind="loading" />
        ) : !conversation ? (
          <CommunityState
            kind="error"
            title="Conversation unavailable"
            body={error || "This chat could not be opened."}
            actionLabel="Try again"
            onAction={() => void load(false)}
          />
        ) : (
          <section className="relative mx-auto flex h-[calc(100dvh-5rem-env(safe-area-inset-top))] min-h-[320px] max-w-3xl flex-col overflow-hidden border-y border-[#f4dcc9] bg-[#fffdf9] dark:border-subtle dark:bg-surface-body sm:my-4 sm:h-[min(760px,calc(100dvh-8rem))] sm:rounded-[24px] sm:border sm:shadow-sm">
            <div ref={messageViewportRef} onScroll={onMessageScroll} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
              {error ? (
                <p
                  role="alert"
                  className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </p>
              ) : null}
              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="mx-auto mb-3 block min-h-10 rounded-xl px-3 text-xs font-bold text-[#f45b16]"
                >
                  {loadingMore ? "Loading…" : "Load earlier messages"}
                </button>
              ) : null}
              {messages.length === 0 ? (
                <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e8] text-[#d94b0f] dark:bg-brand/10 dark:text-brand"><MessageCircle size={27} /></span>
                  <h2 className="mt-4 font-display text-xl font-semibold text-[#4a170d] dark:text-text-primary">Start the conversation</h2>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-[#796f6b] dark:text-text-secondary">Say hello to {name}. Your first message will appear here once you send it.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.senderId === userId;
                  return (
                    <article
                      key={message.id}
                      className={`flex py-2 ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`min-w-0 max-w-[88%] sm:max-w-[76%] ${mine ? "text-end" : ""}`}>
                        <div
                          className={`mb-1 flex items-baseline gap-2 text-[11px] ${mine ? "justify-end" : ""}`}
                        >
                          <span className="font-bold text-[#6b4538] dark:text-text-secondary">
                            {mine ? "You" : message.sender.displayName}
                          </span>
                          <time className="text-[#a18c83] dark:text-text-muted">
                            {formatCommunityTime(message.createdAt)}
                          </time>
                        </div>
                        <p
                          className={`whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-start text-[15px] leading-6 shadow-sm sm:text-base ${mine ? "rounded-se-md bg-[#f45b16] text-white" : "rounded-ss-md border border-[#f4dcc9] bg-white text-[#4a170d] dark:border-subtle dark:bg-surface-layer dark:text-text-primary"}`}
                        >
                          {message.body}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            {showLatestButton ? (
              <button type="button" onClick={scrollToLatest} className="absolute bottom-28 right-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#f4dcc9] bg-white px-4 text-sm font-semibold text-[#4a170d] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40 dark:border-subtle dark:bg-surface-elevated dark:text-text-primary">
                <ArrowDown size={16} /> Latest messages
              </button>
            ) : null}
            <form
              aria-label="Private message composer"
              data-keyboard-avoid
              data-keyboard-scope
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="shrink-0 border-t border-[#f4dcc9] bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-subtle dark:bg-surface-layer sm:p-4"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label={`Message ${name}`}
                  maxLength={DM_MESSAGE_MAX_LENGTH}
                  rows={2}
                  placeholder={`Message ${name}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  enterKeyHint="send"
                  autoCapitalize="sentences"
                  className="min-h-12 max-h-36 flex-1 resize-none rounded-2xl border border-[#f4dcc9] bg-[#fffdf9] px-3 py-2.5 text-base leading-6 outline-none focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/10 dark:border-subtle dark:bg-surface-body"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f45b16] text-white transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/45 disabled:opacity-50"
                  aria-label="Send private message"
                >
                  {sending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
              <p className="mt-1 text-end text-[11px] text-[#a18c83]">
                {draft.length}/{DM_MESSAGE_MAX_LENGTH}
              </p>
            </form>
          </section>
        )}
      </CommunityProductShell>
    </>
  );
}
