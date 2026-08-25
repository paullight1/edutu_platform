import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityDmApi, type DmConversationSummary } from "./dmApi";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import { formatCommunityTime } from "./format";

export default function CommunityChatsPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityDmApi(getToken), [getToken]);
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (!window.confirm(`Remove your conversation with ${conversation.otherUser.displayName} from this inbox?`)) return;
    setBusyId(conversation.id);
    try {
      await api.hideConversation(conversation.id);
      setConversations((current) => current.filter((row) => row.id !== conversation.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That conversation could not be removed.");
    } finally {
      setBusyId(null);
    }
  };

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
          <Link to="/app/community/dm/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f45b16] px-3.5 text-sm font-bold text-white shadow-sm">
            <Plus size={17} /> <span className="hidden sm:inline">New chat</span>
          </Link>
        }
      >
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
            onAction={() => window.location.assign("/app/community/explore")}
          />
        ) : (
          <section className="overflow-hidden rounded-[24px] border border-[#f4dcc9] bg-white shadow-sm dark:border-subtle dark:bg-surface-layer">
            {conversations.map((conversation, index) => (
              <div key={conversation.id} className={`group flex items-center gap-2 px-3 py-2 sm:px-4 ${index !== conversations.length - 1 ? "border-b border-[#f4dcc9] dark:border-subtle" : ""}`}>
                <Link
                  to={`/app/community/dm/${conversation.id}`}
                  className="flex min-h-[70px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35"
                >
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fcead5] text-sm font-extrabold text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary">
                    {conversation.otherUser.displayName.slice(0, 1).toUpperCase()}
                    {conversation.unreadCount > 0 ? <span className="absolute -end-0.5 -top-0.5 min-w-[19px] rounded-full border-2 border-white bg-[#f45b16] px-1 text-center text-[9px] font-extrabold leading-[15px] text-white dark:border-surface-layer">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm text-[#4a170d] dark:text-text-primary ${conversation.unreadCount > 0 ? "font-extrabold" : "font-bold"}`}>{conversation.otherUser.displayName}</span>
                    <span className={`mt-1 block truncate text-sm ${conversation.unreadCount > 0 ? "font-semibold text-[#6b4538] dark:text-text-secondary" : "text-[#8d7b74] dark:text-text-muted"}`}>{conversation.lastMessage.body}</span>
                  </span>
                  <time className={`shrink-0 self-start pt-1 text-[11px] ${conversation.unreadCount > 0 ? "font-bold text-[#f45b16]" : "text-[#9a8278] dark:text-text-muted"}`}>{formatCommunityTime(conversation.lastMessage.createdAt)}</time>
                </Link>
                <button
                  type="button"
                  disabled={busyId === conversation.id}
                  onClick={() => void hide(conversation)}
                  aria-label={`Remove conversation with ${conversation.otherUser.displayName}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#a18c83] opacity-70 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </section>
        )}
      </CommunityProductShell>
    </>
  );
}
