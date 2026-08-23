import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useClerk } from "../hooks/useAuth";
import {
  DM_MESSAGE_MAX_LENGTH,
  acceptDmRequest,
  blockDmUser,
  createDmRequest,
  declineDmRequest,
  fetchDmConversation,
  fetchDmConversations,
  fetchDmMessages,
  fetchDmRelationship,
  fetchDmRequests,
  hideDmConversation,
  isCommunityDmApiError,
  markDmConversationRead,
  sendDmMessage,
  unblockDmUser,
  type DmConversationDetail,
  type DmConversationSummary,
  type DmMessage,
  type DmRequestSummary,
} from "../services/communityDms";

type Notice = { tone: "success" | "error"; text: string } | null;

function initials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "E"
  );
}

function formatActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 2) return "Now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function NoticeBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
        notice.tone === "error"
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-success/20 bg-success/10 text-success"
      }`}
    >
      <span>{notice.text}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onClose} className="rounded-lg p-1 hover:bg-black/5">
        <X size={15} />
      </button>
    </div>
  );
}

export default function CommunityMessagesPage() {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get("user")?.trim() || null;
  const { getToken, userId } = useClerk();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [incoming, setIncoming] = useState<DmRequestSummary[]>([]);
  const [outgoing, setOutgoing] = useState<DmRequestSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DmConversationDetail | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [targetState, setTargetState] = useState<"loading" | "available" | "pending" | "blocked" | null>(null);

  const loadInbox = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setListLoading(true);
      setListError(null);
    }
    try {
      const [conversationRows, incomingRows, outgoingRows] = await Promise.all([
        fetchDmConversations({ limit: 50 }, getToken),
        fetchDmRequests("incoming", { limit: 30 }, getToken),
        fetchDmRequests("outgoing", { limit: 30 }, getToken),
      ]);
      setConversations(conversationRows);
      setIncoming(incomingRows);
      setOutgoing(outgoingRows);
    } catch (cause) {
      if (showLoader) {
        setListError(
          isCommunityDmApiError(cause)
            ? cause.message
            : "Your Community inbox is unavailable right now.",
        );
      }
    } finally {
      if (showLoader) setListLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadInbox(true);
  }, [loadInbox]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void loadInbox(false);
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadInbox]);

  const loadConversation = useCallback(
    async (showLoader: boolean) => {
      if (!conversationId) {
        setDetail(null);
        setMessages([]);
        setDetailError(null);
        return;
      }
      if (showLoader) setDetailLoading(true);
      setDetailError(null);
      try {
        const [conversation, messageRows] = await Promise.all([
          fetchDmConversation(conversationId, getToken),
          fetchDmMessages(conversationId, { limit: 50 }, getToken),
        ]);
        setDetail(conversation);
        setMessages([...messageRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        if (conversation.status === "accepted") {
          await markDmConversationRead(conversation.id, getToken).catch(() => undefined);
          setConversations((current) =>
            current.map((row) =>
              row.id === conversation.id ? { ...row, unreadCount: 0 } : row,
            ),
          );
        }
      } catch (cause) {
        setDetailError(
          isCommunityDmApiError(cause)
            ? cause.message
            : "This conversation could not be loaded.",
        );
      } finally {
        if (showLoader) setDetailLoading(false);
      }
    },
    [conversationId, getToken],
  );

  useEffect(() => {
    void loadConversation(true);
  }, [loadConversation]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void loadConversation(false);
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [conversationId, loadConversation]);

  useEffect(() => {
    if (!targetUserId || conversationId) {
      setTargetState(null);
      return;
    }
    let cancelled = false;
    setTargetState("loading");
    fetchDmRelationship(targetUserId, getToken)
      .then((relationship) => {
        if (cancelled) return;
        if (relationship?.conversationId && relationship.status === "accepted") {
          navigate(`/app/community/messages/${encodeURIComponent(relationship.conversationId)}`, { replace: true });
          return;
        }
        if (relationship?.blocked) {
          setTargetState("blocked");
          return;
        }
        if (relationship?.status === "pending") {
          setTargetState("pending");
          return;
        }
        setTargetState("available");
      })
      .catch((cause) => {
        if (!cancelled) {
          setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "Message permissions could not be checked." });
          setTargetState("available");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, getToken, navigate, targetUserId]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || detail.status !== "accepted" || !composer.trim() || sending) return;
    const body = composer.trim();
    setSending(true);
    setNotice(null);
    try {
      const message = await sendDmMessage(detail.id, body, getToken);
      setMessages((current) =>
        [...current.filter((row) => row.id !== message.id), message].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      );
      setComposer("");
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "Your message could not be sent." });
    } finally {
      setSending(false);
    }
  };

  const startRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetUserId || !requestBody.trim() || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await createDmRequest(targetUserId, requestBody, getToken);
      setRequestBody("");
      setTargetState("pending");
      setNotice({ tone: "success", text: "Message request sent. You can continue after it is accepted." });
      await loadInbox();
      navigate(`/app/community/messages/${encodeURIComponent(result.conversation.id)}`, { replace: true });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "Your message request could not be sent." });
    } finally {
      setSending(false);
    }
  };

  const accept = async (requestId: string) => {
    setBusyAction(requestId);
    setNotice(null);
    try {
      const conversation = await acceptDmRequest(requestId, getToken);
      setIncoming((current) => current.filter((row) => row.id !== requestId));
      setNotice({ tone: "success", text: "Message request accepted." });
      await loadInbox();
      navigate(`/app/community/messages/${encodeURIComponent(conversation.id)}`);
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "The request could not be accepted." });
    } finally {
      setBusyAction(null);
    }
  };

  const decline = async (requestId: string) => {
    setBusyAction(requestId);
    try {
      await declineDmRequest(requestId, getToken);
      setIncoming((current) => current.filter((row) => row.id !== requestId));
      setNotice({ tone: "success", text: "Message request declined." });
      if (conversationId === requestId) navigate("/app/community/messages", { replace: true });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "The request could not be declined." });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleBlock = async () => {
    if (!detail) return;
    setBusyAction("block");
    try {
      if (detail.blocked) {
        await unblockDmUser(detail.otherUser.userId, getToken);
        setDetail({ ...detail, blocked: false });
        setNotice({ tone: "success", text: `${detail.otherUser.displayName} is unblocked.` });
      } else {
        await blockDmUser(detail.otherUser.userId, getToken);
        setDetail({ ...detail, blocked: true });
        setNotice({ tone: "success", text: `${detail.otherUser.displayName} is blocked.` });
      }
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "The block setting could not be changed." });
    } finally {
      setBusyAction(null);
    }
  };

  const hideConversation = async () => {
    if (!detail) return;
    setBusyAction("hide");
    try {
      await hideDmConversation(detail.id, getToken);
      setConversations((current) => current.filter((row) => row.id !== detail.id));
      setNotice({ tone: "success", text: "Conversation removed from your inbox." });
      navigate("/app/community/messages", { replace: true });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityDmApiError(cause) ? cause.message : "The conversation could not be removed." });
    } finally {
      setBusyAction(null);
    }
  };

  const selectedIncoming = useMemo(
    () => incoming.find((request) => request.id === conversationId) ?? null,
    [conversationId, incoming],
  );

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-surface-body px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link to="/app/community" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary">
            <ArrowLeft size={17} /> Community
          </Link>
          <p className="hidden text-xs font-semibold text-text-muted sm:block">Private peer messaging</p>
        </div>
        <NoticeBanner notice={notice} onClose={() => setNotice(null)} />

        <div className="overflow-hidden rounded-[30px] border border-subtle bg-surface-layer shadow-sm lg:grid lg:min-h-[680px] lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`${conversationId ? "hidden lg:block" : "block"} border-b border-subtle lg:border-b-0 lg:border-r`} aria-label="Community inbox">
            <div className="border-b border-subtle p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Community</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">Messages</h1>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600"><Inbox size={20} /></span>
              </div>
            </div>

            <div className="max-h-[70dvh] overflow-y-auto p-3 lg:max-h-[620px]">
              {listLoading ? (
                <div className="space-y-2" aria-label="Loading inbox">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-surface-elevated" />)}</div>
              ) : listError ? (
                <div className="rounded-2xl bg-danger/5 p-4"><p className="text-sm font-semibold">Inbox unavailable</p><p className="mt-1 text-xs leading-5 text-text-secondary">{listError}</p><button type="button" onClick={() => void loadInbox()} className="mt-3 text-xs font-semibold text-brand-700">Try again</button></div>
              ) : (
                <div className="space-y-5">
                  {incoming.length ? (
                    <section aria-labelledby="incoming-requests-title">
                      <div className="flex items-center justify-between px-2"><h2 id="incoming-requests-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Requests</h2><span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-semibold text-brand-700">{incoming.length}</span></div>
                      <div className="mt-2 space-y-2">{incoming.map((request) => <article key={request.id} className="rounded-2xl border border-subtle p-3"><button type="button" onClick={() => navigate(`/app/community/messages/${encodeURIComponent(request.id)}`)} className="flex w-full items-center gap-3 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-xs font-semibold text-brand-700">{initials(request.otherUser.displayName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{request.otherUser.displayName}</span><span className="mt-0.5 block truncate text-xs text-text-secondary">{request.firstMessage.body}</span></span><ChevronRight size={15} className="text-text-muted" /></button><div className="mt-2 flex gap-2 pl-[52px]"><button type="button" disabled={busyAction === request.id} onClick={() => void decline(request.id)} className="min-h-9 rounded-xl border border-subtle px-3 text-2xs font-semibold">Decline</button><button type="button" disabled={busyAction === request.id} onClick={() => void accept(request.id)} className="min-h-9 rounded-xl bg-brand-500 px-3 text-2xs font-semibold text-white">Accept</button></div></article>)}</div>
                    </section>
                  ) : null}

                  <section aria-labelledby="conversation-list-title">
                    <h2 id="conversation-list-title" className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Conversations</h2>
                    <div className="mt-2 space-y-1">{conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => navigate(`/app/community/messages/${encodeURIComponent(conversation.id)}`)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${conversation.id === conversationId ? "bg-brand-500/10" : "hover:bg-surface-elevated"}`}><span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-xs font-semibold">{initials(conversation.otherUser.displayName)}{conversation.unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand-500 px-1 text-center text-2xs font-semibold leading-5 text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span> : null}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{conversation.otherUser.displayName}</span><span className="shrink-0 text-2xs text-text-muted">{formatActivity(conversation.lastMessageAt)}</span></span><span className="mt-1 block truncate text-xs text-text-secondary">{conversation.lastMessage.body}</span></span></button>) : <div className="rounded-2xl border border-dashed border-subtle p-5 text-center"><MessageCircle size={20} className="mx-auto text-brand-500" /><p className="mt-2 text-xs leading-5 text-text-muted">No accepted conversations yet.</p></div>}</div>
                  </section>

                  {outgoing.length ? <section><h2 className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Sent requests</h2><div className="mt-2 space-y-1">{outgoing.map((request) => <div key={request.id} className="flex items-center gap-3 rounded-2xl p-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated text-2xs font-semibold">{initials(request.otherUser.displayName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{request.otherUser.displayName}</span><span className="mt-0.5 block text-2xs text-text-muted">Waiting for approval</span></span></div>)}</div></section> : null}
                </div>
              )}
            </div>
          </aside>

          <section className={`${conversationId ? "flex" : "hidden lg:flex"} min-w-0 flex-col`} aria-label="Selected conversation">
            {detailLoading ? <div className="flex min-h-[600px] items-center justify-center"><Loader2 size={24} className="animate-spin text-brand-500" aria-label="Loading conversation" /></div> : detailError ? <div className="m-auto max-w-md p-8 text-center"><h2 className="text-lg font-semibold">Conversation unavailable</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{detailError}</p><button type="button" onClick={() => void loadConversation(true)} className="mt-4 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white">Try again</button></div> : detail ? (
              <>
                <header className="flex min-h-[76px] items-center gap-3 border-b border-subtle px-4 py-3 sm:px-5">
                  <button type="button" aria-label="Back to inbox" onClick={() => navigate("/app/community/messages")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-elevated lg:hidden"><ArrowLeft size={19} /></button>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-xs font-semibold">{initials(detail.otherUser.displayName)}</span>
                  <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{detail.otherUser.displayName}</h2><p className="mt-0.5 text-xs text-text-muted">{detail.status === "accepted" ? "Private conversation" : "Message request"}</p></div>
                  <button type="button" disabled={busyAction === "block"} onClick={() => void toggleBlock()} aria-label={`${detail.blocked ? "Unblock" : "Block"} ${detail.otherUser.displayName}`} className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${detail.blocked ? "border-brand-500/30 text-brand-700" : "border-subtle text-text-secondary"}`}><Ban size={14} /> <span className="hidden sm:inline">{detail.blocked ? "Unblock" : "Block"}</span></button>
                  <button type="button" disabled={busyAction === "hide"} onClick={() => void hideConversation()} aria-label="Remove conversation from inbox" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-subtle text-text-muted hover:text-danger"><Trash2 size={15} /></button>
                </header>

                {detail.status === "pending" ? (
                  <div className="border-b border-warning/20 bg-warning/10 p-4 sm:p-5">{detail.requestedBy === userId ? <p className="text-sm leading-6 text-text-secondary">Your message request is waiting for {detail.otherUser.displayName} to accept it. You cannot send more messages yet.</p> : <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Accept this message request?</p><p className="mt-1 text-xs leading-5 text-text-secondary">Accept only if you want to continue this private conversation.</p></div><div className="flex gap-2"><button type="button" disabled={busyAction === detail.id} onClick={() => void decline(detail.id)} className="min-h-10 rounded-xl border border-subtle bg-surface-layer px-4 text-xs font-semibold">Decline</button><button type="button" disabled={busyAction === detail.id} onClick={() => void accept(detail.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white"><Check size={14} /> Accept</button></div></div>}</div>
                ) : null}

                {detail.blocked ? <div className="border-b border-danger/20 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger">This conversation is blocked. Unblock the member to send messages again.</div> : null}

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
                  {messages.length ? <div className="mx-auto max-w-3xl space-y-4">{messages.map((message) => { const mine = message.senderId === userId; return <article key={message.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-2xs font-semibold">{initials(mine ? "You" : message.sender.displayName)}</span><div className={`max-w-[82%] ${mine ? "text-right" : ""}`}><div className={`rounded-[20px] px-4 py-3 text-left text-sm leading-6 ${mine ? "bg-brand-500 text-white" : "bg-surface-elevated text-text-primary"}`}>{message.body}</div><p className="mt-1 text-2xs text-text-muted">{formatActivity(message.createdAt)}</p></div></article>; })}</div> : <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><MessageCircle size={28} className="text-brand-500" /><h3 className="mt-4 font-semibold">Conversation ready</h3><p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">Keep private messages respectful and avoid sharing sensitive personal information.</p></div>}
                </div>

                {detail.status === "accepted" ? <form onSubmit={send} className="border-t border-subtle p-3 sm:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Message {detail.otherUser.displayName}</span><textarea aria-label={`Message ${detail.otherUser.displayName}`} value={composer} onChange={(event) => setComposer(event.target.value.slice(0, DM_MESSAGE_MAX_LENGTH))} disabled={detail.blocked} rows={1} maxLength={DM_MESSAGE_MAX_LENGTH} placeholder={detail.blocked ? "Unblock this member to continue" : "Write a private message"} className="max-h-36 min-h-11 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60" /><span className="mt-1 block text-right text-2xs text-text-muted">{composer.length}/{DM_MESSAGE_MAX_LENGTH}</span></label><button type="submit" aria-label="Send private message" disabled={sending || detail.blocked || !composer.trim()} className="mb-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white disabled:opacity-50">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button></div></form> : null}
              </>
            ) : selectedIncoming ? <div className="m-auto max-w-md p-8 text-center"><h2 className="text-xl font-semibold">Message request from {selectedIncoming.otherUser.displayName}</h2><p className="mt-3 rounded-2xl bg-surface-elevated p-4 text-left text-sm leading-6">{selectedIncoming.firstMessage.body}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => void decline(selectedIncoming.id)} className="min-h-11 rounded-2xl border border-subtle px-5 text-sm font-semibold">Decline</button><button type="button" onClick={() => void accept(selectedIncoming.id)} className="min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white">Accept</button></div></div> : null}
          </section>

          {!conversationId ? (
            <section className="hidden min-w-0 flex-col items-center justify-center p-8 text-center lg:flex">
              {targetUserId ? (
                <div className="w-full max-w-lg">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600"><UserPlus size={23} /></span>
                  <h2 className="mt-4 text-xl font-semibold">Start a private conversation</h2>
                  {targetState === "loading" ? <p className="mt-3 text-sm text-text-muted">Checking message permissions…</p> : targetState === "blocked" ? <p className="mt-3 text-sm leading-6 text-text-secondary">This member is blocked, so a new request cannot be started.</p> : targetState === "pending" ? <p className="mt-3 text-sm leading-6 text-text-secondary">A message request already exists with this member. Wait for the pending request to be resolved.</p> : <form onSubmit={startRequest} className="mt-5 text-left"><label className="block"><span className="text-sm font-semibold">First message</span><textarea aria-label="First private message" value={requestBody} onChange={(event) => setRequestBody(event.target.value.slice(0, DM_MESSAGE_MAX_LENGTH))} maxLength={DM_MESSAGE_MAX_LENGTH} rows={4} required className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm leading-6 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Introduce yourself and say why you are reaching out." /></label><div className="mt-2 flex items-center justify-between text-2xs text-text-muted"><span>Recipient: {targetUserId}</span><span>{requestBody.length}/{DM_MESSAGE_MAX_LENGTH}</span></div><button type="submit" disabled={sending || !requestBody.trim()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-50"><Send size={16} /> {sending ? "Sending…" : "Send request"}</button></form>}
                </div>
              ) : (
                <div className="max-w-md"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-brand-500/10 text-brand-600"><MessageCircle size={26} /></span><h2 className="mt-5 text-xl font-semibold">Choose a conversation</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Open a conversation from the inbox, or message someone from a Community group. New conversations begin as requests.</p></div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
