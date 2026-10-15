import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCheck, MessageCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityDmApi, type DmConversationSummary } from "./dmApi";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import { formatCommunityTime } from "./format";
import CommunityActionSheet from "./components/CommunityActionSheet";

export default function CommunityChatsPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityDmApi(getToken), [getToken]);
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hideTarget, setHideTarget] = useState<DmConversationSummary | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConversations(await api.listConversations({ limit: 50 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Messages are unavailable right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const hide = async (conversation: DmConversationSummary) => {
    setBusyId(conversation.id);
    try {
      await api.hideConversation(conversation.id);
      setConversations((current) => current.filter((row) => row.id !== conversation.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That conversation could not be removed.");
    } finally {
      setBusyId(null);
      setHideTarget(null);
    }
  };

  const unreadCount = conversations.filter((conversation) => conversation.unreadCount > 0).length;
  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) =>
      (!unreadOnly || conversation.unreadCount > 0) &&
      (!normalized || `${conversation.otherUser.displayName} ${conversation.lastMessage.body}`
        .toLowerCase()
        .includes(normalized)),
    );
  }, [conversations, query, unreadOnly]);

  return (
    <>
      <Seo
        title="Community chats | Edutu"
        description="Private conversations with Edutu community members you chose to connect with."
        path="/app/community/chats"
        noindex
      />
      <CommunityProductShell
        title="Chats"
        description="Private conversations with people you have chosen to connect with."
        action={
          <Link to="/app/community/dm/new" aria-label="New chat" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#17120f] text-white transition hover:bg-[#f45b16] active:scale-95 dark:bg-text-primary dark:text-surface-body">
            <Plus size={21} />
          </Link>
        }
      >
        <div className="pb-4 pt-5 sm:pt-7">
          <label className="relative block">
            <span className="sr-only">Search chats</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[#76706c]" size={20} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people or messages"
              aria-label="Search chats"
              className="min-h-[48px] w-full rounded-2xl border border-[#eae3dd] bg-[#f3f1ef] ps-12 pe-4 text-base text-[#17120f] outline-none transition placeholder:text-[#817a76] focus:border-[#f45b16]/35 focus:bg-white focus:ring-2 focus:ring-[#f45b16]/12 dark:bg-surface-elevated dark:text-text-primary dark:focus:bg-surface-layer"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Filter conversations" className="inline-flex rounded-full bg-[#f3f1ef] p-1 dark:bg-surface-elevated">
              <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/50 ${!unreadOnly ? "bg-white text-[#17120f] shadow-sm dark:bg-surface-layer dark:text-text-primary" : "text-[#796f6b] dark:text-text-secondary"}`}>
                All <span className="tabular-nums">{conversations.length}</span>
              </button>
              <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/50 ${unreadOnly ? "bg-white text-[#17120f] shadow-sm dark:bg-surface-layer dark:text-text-primary" : "text-[#796f6b] dark:text-text-secondary"}`}>
                Unread <span className="tabular-nums">{unreadCount}</span>
              </button>
            </div>
            {query ? <button type="button" onClick={() => setQuery("")} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#796f6b] hover:text-[#f45b16] dark:text-text-secondary"><X size={15} /> Clear search</button> : null}
          </div>
        </div>
        {error && conversations.length > 0 ? (
          <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            <span>{error}</span>
            <button type="button" onClick={() => { setRefreshing(true); void load(); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Retry</button>
          </div>
        ) : null}

        {loading ? (
          <CommunityState kind="loading" />
        ) : error && conversations.length === 0 ? (
          <CommunityState kind="error" body={error} actionLabel="Try again" onAction={() => void load()} />
        ) : conversations.length === 0 ? (
          <CommunityState
            kind="empty"
            title="No private conversations yet"
            body="Community groups are the best place to meet people first. When you both choose to connect, your conversation appears here."
            actionLabel="Explore communities"
            icon={MessageCircle}
            onAction={() => navigate("/app/community/explore")}
          />
        ) : unreadOnly && unreadCount === 0 && !query ? (
          <CommunityState kind="empty" icon={CheckCheck} title="All caught up" body="You have no unread chats. Your conversations are still here whenever you need them." actionLabel="View all chats" onAction={() => setUnreadOnly(false)} />
        ) : visibleConversations.length === 0 ? (
          <CommunityState
            kind="empty"
            icon={Search}
            title="No conversations found"
            body="Try another name or message, or remove your filters to see all chats."
            actionLabel="Clear filters"
            onAction={() => { setQuery(""); setUnreadOnly(false); }}
          />
        ) : (
          <section aria-label="Chat conversations" className="-mx-4 divide-y divide-[#ece8e5] border-y border-[#ece8e5] bg-white sm:mx-0 dark:divide-subtle dark:border-subtle dark:bg-surface-layer">
            {visibleConversations.map((conversation) => (
              <div key={conversation.id} className="group flex items-center gap-1 px-3 py-1 sm:px-4">
                <Link
                  to={`/app/community/dm/${conversation.id}`}
                  className="flex min-h-[82px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2 transition hover:bg-[#fff8f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:hover:bg-surface-elevated"
                >
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ece8e5] text-base font-bold text-[#5a514c] dark:bg-surface-elevated dark:text-text-secondary">
                    {conversation.otherUser.avatarUrl ? (
                      <img src={conversation.otherUser.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : conversation.otherUser.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-base text-[#17120f] dark:text-text-primary ${conversation.unreadCount > 0 ? "font-bold" : "font-semibold"}`}>{conversation.otherUser.displayName}</span>
                    <span className={`mt-0.5 block truncate text-sm ${conversation.unreadCount > 0 ? "font-medium text-[#4e4743] dark:text-text-secondary" : "text-[#817a76] dark:text-text-muted"}`}>{conversation.lastMessage.body}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2 self-stretch py-2">
                    <time className={`text-xs tabular-nums ${conversation.unreadCount > 0 ? "font-bold text-[#f45b16]" : "text-[#8b837e] dark:text-text-muted"}`}>{formatCommunityTime(conversation.lastMessage.createdAt)}</time>
                    {conversation.unreadCount > 0 ? <span className="flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f45b16] px-1 text-[9px] font-bold text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span> : null}
                  </span>
                </Link>
                <button
                  type="button"
                  disabled={busyId === conversation.id}
                  onClick={() => setHideTarget(conversation)}
                  aria-label={`Remove conversation with ${conversation.otherUser.displayName}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#796f6b] opacity-100 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 disabled:opacity-40 dark:text-text-secondary dark:hover:bg-red-500/10"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </section>
        )}
      </CommunityProductShell>
      <CommunityActionSheet
        open={hideTarget !== null}
        title="Remove conversation"
        description={
          hideTarget
            ? `Remove your conversation with ${hideTarget.otherUser.displayName} from this inbox.`
            : "Remove this conversation from your inbox."
        }
        confirmLabel="Remove"
        busy={busyId !== null}
        onClose={() => setHideTarget(null)}
        onConfirm={() => {
          if (hideTarget) void hide(hideTarget);
        }}
      />
    </>
  );
}
