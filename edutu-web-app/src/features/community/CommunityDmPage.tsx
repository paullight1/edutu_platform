import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import Seo from "../../components/Seo";
import {
  CommunityDmApi,
  DM_MESSAGE_MAX_LENGTH,
  type DmConversationDetail,
  type DmMessage,
  type DmProfile,
} from "./dmApi";
import {
  subscribeToDmMessages,
  type DmRealtimeMessage,
} from "./dmRealtime";
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
  const [conversation, setConversation] =
    useState<DmConversationDetail | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<DmConversationDetail | null>(null);

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

  useEffect(() => {
    const unsubscribe = subscribeToDmMessages(id, (event) => {
      const hydrated = hydrateRealtimeMessage(
        event,
        userId,
        conversationRef.current,
      );
      setMessages((current) => mergeMessages(current, [hydrated]));
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
        action={
          <Link
            to="/app/community/chats"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f4dcc9] bg-white text-[#796f6b] dark:border-subtle dark:bg-surface-layer"
            aria-label="Back to chats"
          >
            <ArrowLeft size={18} />
          </Link>
        }
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
          <section className="mx-auto flex min-h-[600px] max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#f4dcc9] bg-[#fffdf9] shadow-sm dark:border-subtle dark:bg-surface-body">
            <div className="flex-1 px-3 py-4 sm:px-5">
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
                <div className="flex min-h-[360px] items-center justify-center text-center">
                  <p className="max-w-sm text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
                    This conversation is accepted, but no messages are visible
                    yet.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.senderId === userId;
                  return (
                    <article
                      key={message.id}
                      className={`flex py-2 ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[82%] ${mine ? "text-right" : ""}`}>
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
                          className={`whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-left text-[15px] leading-6 shadow-sm sm:text-base ${mine ? "rounded-tr-md bg-[#f45b16] text-white" : "rounded-tl-md border border-[#f4dcc9] bg-white text-[#4a170d] dark:border-subtle dark:bg-surface-layer dark:text-text-primary"}`}
                        >
                          {message.body}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <div className="sticky bottom-0 border-t border-[#f4dcc9] bg-white/95 p-3 backdrop-blur dark:border-subtle dark:bg-surface-layer/95 sm:p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={DM_MESSAGE_MAX_LENGTH}
                  rows={2}
                  placeholder={`Message ${name}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  className="min-h-12 max-h-36 flex-1 resize-none rounded-2xl border border-[#f4dcc9] bg-[#fffdf9] px-3 py-2.5 text-base leading-6 outline-none focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/10 dark:border-subtle dark:bg-surface-body"
                />
                <button
                  type="button"
                  disabled={!draft.trim() || sending}
                  onClick={() => void send()}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f45b16] text-white disabled:opacity-50"
                  aria-label="Send private message"
                >
                  {sending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
              <p className="mt-1 text-right text-[11px] text-[#a18c83]">
                {draft.length}/{DM_MESSAGE_MAX_LENGTH}
              </p>
            </div>
          </section>
        )}
      </CommunityProductShell>
    </>
  );
}