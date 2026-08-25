import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Archive,
  ExternalLink,
  FileText,
  Flag,
  Loader2,
  MessageCircle,
  Send,
  Settings,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, isCommunityApiError } from "./api";
import { useGroupMessages } from "./useGroupMessages";
import type {
  CommunityGroupResource,
  CommunityMemberSummary,
  CommunityMessage,
  GroupDetail,
  GroupForm,
  JoinRequestAnswer,
} from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import GroupAvatar from "./components/GroupAvatar";
import MessageBubble from "./components/MessageBubble";
import { formatCommunityTime, groupTimingLabel } from "./format";

const FIRST_POST_KEY = "edutu:web:community:first-post-safety:v1";
type Tab = "posts" | "resources" | "about";

export default function CommunityGroupPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = params.get("tab");
  const tab: Tab = requestedTab === "resources" || requestedTab === "about" ? requestedTab : "posts";
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [firstPostAccepted, setFirstPostAccepted] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(FIRST_POST_KEY) === "1";
    } catch {
      return false;
    }
  });

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setDetailError(null);
    try {
      setDetail(await api.getGroup(id));
    } catch (caught) {
      setDetailError(
        isCommunityApiError(caught)
          ? caught.message
          : "We couldn't load this community right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const group = detail?.group ?? null;
  const membership = detail?.membership ?? null;
  const status = membership?.status ?? null;
  const canRead = Boolean(group) && (group?.visibility === "public" || status === "active" || status === "invited");
  const canPost = status === "active" && !group?.archivedAt;
  const canModerate = Boolean(
    userId &&
      group &&
      ((group.ownerId === userId && status !== "removed" && status !== "banned") ||
        (status === "active" && (membership?.role === "owner" || membership?.role === "mod"))),
  );
  const owner = Boolean(userId && group && group.ownerId === userId && status !== "removed" && status !== "banned");

  const messages = useGroupMessages({ api, groupId: id, enabled: canRead });

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !canPost || busy) return;
    if (!firstPostAccepted) return;
    setBusy("send");
    setComposerError(null);
    try {
      const sent = await api.sendMessage(id, { body, kind: "text" });
      messages.append(sent);
      setDraft("");
    } catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : "That message could not be sent.");
    } finally {
      setBusy(null);
    }
  };

  const join = async (answers: JoinRequestAnswer[] = []) => {
    if (busy) return;
    setBusy("join");
    setDetailError(null);
    try {
      await api.joinGroup(id, answers);
      await loadDetail();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "We couldn't update your membership.");
    } finally {
      setBusy(null);
    }
  };

  const deleteMessage = async (message: CommunityMessage) => {
    if (!window.confirm("Remove this message? It will remain as a moderation tombstone.")) return;
    setBusy(`delete:${message.id}`);
    try {
      const updated = await api.deleteMessage(message.id) as CommunityMessage;
      messages.replace(updated);
    } catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : "The message could not be removed.");
    } finally {
      setBusy(null);
    }
  };

  const openAttachment = async (message: CommunityMessage) => {
    try {
      const body = JSON.parse(message.body) as { url?: unknown };
      if (typeof body.url !== "string") throw new Error("That attachment is unavailable.");
      const resolved = await api.resolveAttachmentUrl(body.url);
      const url = new URL(resolved.url);
      if (url.protocol !== "https:") throw new Error("That attachment is unavailable.");
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : "That attachment is unavailable.");
    }
  };

  if (loading) {
    return (
      <CommunityProductShell title="Community" description="Loading this room…">
        <CommunityState kind="loading" />
      </CommunityProductShell>
    );
  }

  if (!group || !detail) {
    return (
      <CommunityProductShell title="Community unavailable">
        <CommunityState
          kind="error"
          title="This community cannot be opened"
          body={detailError || "It may be private, removed, or temporarily unavailable."}
          actionLabel="Back to Explore"
          onAction={() => navigate("/app/community/explore")}
        />
      </CommunityProductShell>
    );
  }

  const timing = groupTimingLabel(group);

  return (
    <>
      <Seo
        title={`${group.name} | Edutu Community`}
        description={group.description || `Open ${group.name} in Edutu Community.`}
        path={`/app/community/groups/${group.id}`}
        noindex
      />
      <CommunityProductShell
        title={group.name}
        description={group.description || "A focused Edutu community room."}
        action={canModerate ? (
          <Link
            to={`/app/community/groups/${group.id}?tab=about&admin=1`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f4dcc9] bg-white text-[#796f6b] shadow-sm hover:text-[#f45b16] dark:border-subtle dark:bg-surface-layer dark:text-text-secondary"
            aria-label="Community settings"
          >
            <Settings size={18} />
          </Link>
        ) : undefined}
      >
        <section className="mb-5 rounded-[24px] border border-[#f4dcc9] bg-white p-4 shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-5">
          <div className="flex items-start gap-3">
            <GroupAvatar emoji={group.coverEmoji} name={group.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#fcead5] px-2.5 py-1 text-[11px] font-bold text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary">
                  {group.visibility === "private" ? "Private" : "Public"}
                </span>
                <span className="rounded-full bg-[#fcead5] px-2.5 py-1 text-[11px] font-bold text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary">
                  {group.joinPolicy === "request" ? "Approval required" : "Open joining"}
                </span>
                {timing ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{timing}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-[#8d7b74] dark:text-text-muted">
                <span className="inline-flex items-center gap-1.5"><UsersRound size={14} /> {group.memberCount.toLocaleString()} members</span>
                <span className="inline-flex items-center gap-1.5"><MessageCircle size={14} /> {group.messageCount.toLocaleString()} posts</span>
                <span>Active {formatCommunityTime(group.lastMessageAt || group.createdAt)}</span>
              </div>
            </div>
          </div>

          <MembershipAction
            detail={detail}
            busy={busy === "join"}
            error={detailError}
            onJoin={join}
          />
        </section>

        <div className="mb-4 flex gap-1 rounded-2xl border border-[#f4dcc9] bg-white p-1 dark:border-subtle dark:bg-surface-layer" role="tablist" aria-label="Community content">
          {(["posts", "resources", "about"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (item === "posts") next.delete("tab");
                else next.set("tab", item);
                setParams(next, { replace: true });
              }}
              className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-bold capitalize transition ${
                tab === item
                  ? "bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"
                  : "text-[#796f6b] hover:bg-[#fff9f1] dark:text-text-secondary dark:hover:bg-surface-elevated"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "posts" ? (
          <PostsPanel
            groupId={id}
            userId={userId ?? null}
            membershipRole={membership?.role ?? null}
            canModerate={canModerate}
            canPost={canPost}
            firstPostAccepted={firstPostAccepted}
            onAcceptFirstPost={() => {
              setFirstPostAccepted(true);
              try { window.localStorage.setItem(FIRST_POST_KEY, "1"); } catch { /* optional */ }
            }}
            draft={draft}
            setDraft={setDraft}
            composerError={composerError || messages.error}
            sending={busy === "send"}
            onSend={() => void sendMessage()}
            messages={messages.messages}
            loading={messages.loading}
            loadingMore={messages.loadingMore}
            hasMore={messages.hasMore}
            onLoadMore={() => void messages.loadMore()}
            onDelete={(message) => void deleteMessage(message)}
            onOpenAttachment={(message) => void openAttachment(message)}
          />
        ) : tab === "resources" ? (
          <ResourcesPanel api={api} groupId={id} enabled={canRead} onError={setComposerError} />
        ) : (
          <AboutPanel
            api={api}
            detail={detail}
            userId={userId ?? null}
            canModerate={canModerate}
            owner={owner}
            onRefresh={loadDetail}
            onError={setDetailError}
          />
        )}
      </CommunityProductShell>
    </>
  );
}

function MembershipAction({
  detail,
  busy,
  error,
  onJoin,
}: {
  detail: GroupDetail;
  busy: boolean;
  error: string | null;
  onJoin: (answers?: JoinRequestAnswer[]) => Promise<void>;
}) {
  const { group, membership } = detail;
  const status = membership?.status ?? null;
  const [showForm, setShowForm] = useState(false);
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [form, setForm] = useState<GroupForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);

  const startJoin = async () => {
    if (status === "invited" || group.joinPolicy === "open") {
      await onJoin([]);
      return;
    }
    setShowForm(true);
    setFormLoading(true);
    try {
      setForm(await api.getForm(group.id));
    } catch {
      setForm({ questions: [] });
    } finally {
      setFormLoading(false);
    }
  };

  if (status === "active") return null;
  if (status === "pending") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <Loader2 size={17} className="mt-0.5 shrink-0" />
        <div><p className="font-bold">Waiting for approval</p><p className="mt-0.5 leading-5">An owner or moderator still needs to review your request. You cannot post until it is approved.</p></div>
      </div>
    );
  }
  if (status === "banned") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
        <ShieldAlert size={17} className="mt-0.5 shrink-0" />
        <div><p className="font-bold">You cannot rejoin this community</p><p className="mt-0.5 leading-5">This is a moderator decision, so Edutu does not show a retry action.</p></div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-[#f4dcc9] pt-4 dark:border-subtle">
      {status === "invited" ? (
        <p className="mb-3 text-sm leading-6 text-[#6b4538] dark:text-text-secondary"><strong>You were invited.</strong> You can preview this room before accepting.</p>
      ) : null}
      {!showForm ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startJoin()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {status === "invited" ? "Accept invitation" : group.joinPolicy === "request" ? "Request to join" : "Join community"}
        </button>
      ) : (
        <div className="space-y-4 rounded-2xl bg-[#fff9f1] p-4 dark:bg-surface-elevated">
          <div><p className="font-bold text-[#4a170d] dark:text-text-primary">Request to join</p><p className="mt-1 text-xs leading-5 text-[#796f6b] dark:text-text-secondary">Answer only what the owners need to decide whether this group fits.</p></div>
          {formLoading ? <p className="text-sm text-[#796f6b]">Loading questions…</p> : null}
          {(form?.questions ?? []).map((question) => (
            <label key={question.id} className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#4a170d] dark:text-text-primary">{question.label}{question.required ? " *" : ""}</span>
              {question.type === "single_select" ? (
                <select
                  value={answers[question.id] ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  className="min-h-11 w-full rounded-xl border border-[#f4dcc9] bg-white px-3 text-sm dark:border-subtle dark:bg-surface-layer"
                >
                  <option value="">Choose one</option>
                  {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <textarea
                  value={answers[question.id] ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  rows={question.type === "long_text" ? 4 : 2}
                  className="w-full rounded-xl border border-[#f4dcc9] bg-white px-3 py-2 text-sm dark:border-subtle dark:bg-surface-layer"
                />
              )}
            </label>
          ))}
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-xl border border-[#f4dcc9] px-4 text-sm font-bold dark:border-subtle">Cancel</button>
            <button
              type="button"
              disabled={busy || (form?.questions ?? []).some((question) => question.required && !(answers[question.id] ?? "").trim())}
              onClick={() => void onJoin((form?.questions ?? []).map((question) => ({ id: question.id, value: (answers[question.id] ?? "").trim() })).filter((answer) => answer.value))}
              className="min-h-11 rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              Send request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PostsPanel({
  userId,
  membershipRole,
  canModerate,
  canPost,
  firstPostAccepted,
  onAcceptFirstPost,
  draft,
  setDraft,
  composerError,
  sending,
  onSend,
  messages,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onDelete,
  onOpenAttachment,
}: {
  groupId: string;
  userId: string | null;
  membershipRole: string | null;
  canModerate: boolean;
  canPost: boolean;
  firstPostAccepted: boolean;
  onAcceptFirstPost: () => void;
  draft: string;
  setDraft: (value: string) => void;
  composerError: string | null;
  sending: boolean;
  onSend: () => void;
  messages: CommunityMessage[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onDelete: (message: CommunityMessage) => void;
  onOpenAttachment: (message: CommunityMessage) => void;
}) {
  return (
    <section className="rounded-[24px] border border-[#f4dcc9] bg-[#fffdf9] dark:border-subtle dark:bg-surface-body">
      <div className="flex min-h-[420px] flex-col px-3 py-3 sm:px-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-[#f45b16]" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><MessageCircle size={21} /></span>
            <h2 className="mt-3 font-display text-lg font-semibold text-[#4a170d] dark:text-text-primary">Start with something useful</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#796f6b] dark:text-text-secondary">Ask a focused question, share what you learned, or help someone unblock an application.</p>
          </div>
        ) : (
          <>
            {hasMore ? (
              <button type="button" disabled={loadingMore} onClick={onLoadMore} className="mx-auto mb-3 min-h-10 rounded-xl px-3 text-xs font-bold text-[#f45b16] disabled:opacity-60">
                {loadingMore ? "Loading…" : "Load earlier posts"}
              </button>
            ) : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mine={message.userId === userId}
                canDelete={Boolean(message.userId === userId || canModerate || membershipRole === "owner")}
                onDelete={onDelete}
                onOpenAttachment={onOpenAttachment}
              />
            ))}
          </>
        )}
      </div>

      {canPost ? (
        <div className="sticky bottom-0 border-t border-[#f4dcc9] bg-white/95 p-3 backdrop-blur dark:border-subtle dark:bg-surface-layer/95 sm:p-4">
          {!firstPostAccepted ? (
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="font-bold">Before your first community post</p>
              <p className="mt-1 text-xs leading-5">Keep money requests, passwords, verification codes and off-platform pressure out of community conversations. Edutu screens messages for common scam patterns.</p>
              <button type="button" onClick={onAcceptFirstPost} className="mt-2 min-h-10 rounded-xl bg-amber-900 px-3 text-xs font-bold text-white dark:bg-amber-200 dark:text-amber-950">I understand</button>
            </div>
          ) : null}
          {composerError ? <p role="alert" className="mb-2 text-xs font-semibold leading-5 text-red-600 dark:text-red-300">{composerError}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
              placeholder="Write a useful post…"
              rows={2}
              className="min-h-12 max-h-36 flex-1 resize-none rounded-2xl border border-[#f4dcc9] bg-[#fffdf9] px-3 py-2.5 text-base leading-6 outline-none focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/10 dark:border-subtle dark:bg-surface-body"
            />
            <button
              type="button"
              disabled={!firstPostAccepted || !draft.trim() || sending}
              onClick={onSend}
              aria-label="Send post"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f45b16] text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
            </button>
          </div>
          <p className="mt-1.5 text-end text-[11px] text-[#a18c83]">{draft.length}/2000</p>
        </div>
      ) : null}
    </section>
  );
}

function ResourcesPanel({
  api,
  groupId,
  enabled,
  onError,
}: {
  api: CommunityApi;
  groupId: string;
  enabled: boolean;
  onError: (message: string | null) => void;
}) {
  const [resources, setResources] = useState<CommunityGroupResource[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [cursor, setCursor] = useState<{ before: string; beforeId: string } | null>(null);

  const load = useCallback(async (more = false) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const page = await api.fetchResources(groupId, {
        before: more ? cursor?.before : undefined,
        beforeId: more ? cursor?.beforeId : undefined,
        limit: 30,
      });
      setResources((current) => more ? [...current, ...page.resources.filter((next) => !current.some((row) => row.id === next.id))] : page.resources);
      setCursor(page.nextCursor);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Resources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [api, cursor?.before, cursor?.beforeId, enabled, groupId, onError]);

  useEffect(() => {
    void load(false);
    // Initial resource page only; cursor changes should not refetch page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, enabled, groupId]);

  if (!enabled) return <CommunityState kind="empty" title="Resources are not available" body="Join or accept your invitation to access protected group resources." />;
  if (loading && resources.length === 0) return <CommunityState kind="loading" />;
  if (resources.length === 0) return <CommunityState kind="empty" title="No shared resources yet" body="Images and PDF files shared in this room will collect here so they do not disappear in chat history." />;

  return (
    <div className="space-y-3">
      {resources.map((resource) => (
        <button
          key={resource.id}
          type="button"
          onClick={async () => {
            try {
              const result = await api.resolveAttachmentUrl(resource.attachment.url);
              window.open(result.url, "_blank", "noopener,noreferrer");
            } catch (caught) {
              onError(caught instanceof Error ? caught.message : "That resource is unavailable.");
            }
          }}
          className="flex min-h-20 w-full items-center gap-3 rounded-[20px] border border-[#f4dcc9] bg-white p-3 text-start shadow-sm transition hover:border-[#f45b16]/30 dark:border-subtle dark:bg-surface-layer"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><FileText size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[#4a170d] dark:text-text-primary">{resource.attachment.name}</span>
            <span className="mt-0.5 block truncate text-xs text-[#796f6b] dark:text-text-secondary">{resource.sender.displayName} · {formatCommunityTime(resource.createdAt)}</span>
          </span>
          <ExternalLink size={16} className="shrink-0 text-[#a18c83]" />
        </button>
      ))}
      {cursor ? <button type="button" disabled={loading} onClick={() => void load(true)} className="mx-auto block min-h-10 rounded-xl px-4 text-sm font-bold text-[#f45b16]">{loading ? "Loading…" : "Load more"}</button> : null}
    </div>
  );
}

function AboutPanel({
  api,
  detail,
  userId,
  canModerate,
  owner,
  onRefresh,
  onError,
}: {
  api: CommunityApi;
  detail: GroupDetail;
  userId: string | null;
  canModerate: boolean;
  owner: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { group, membership } = detail;
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteUserId, setInviteUserId] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void api.getMembers(group.id, 100)
      .then((result) => { if (active) setMembers(result.members); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingMembers(false); });
    return () => { active = false; };
  }, [api, group.id]);

  const leave = async () => {
    if (!userId || !membership) return;
    if (!window.confirm("Leave this community? You may need to request access again later.")) return;
    setWorking("leave");
    try {
      await api.leaveGroup(group.id, userId);
      navigate("/app/community/groups", { replace: true });
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "You could not leave this community.");
    } finally {
      setWorking(null);
    }
  };

  const archive = async () => {
    if (!window.confirm("Archive this community permanently? Archiving cannot be undone and makes the room read-only.")) return;
    setWorking("archive");
    try {
      await api.archiveGroup(group.id);
      await onRefresh();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "This community could not be archived.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <section className="rounded-[22px] border border-[#f4dcc9] bg-white p-5 dark:border-subtle dark:bg-surface-layer">
          <h2 className="font-display text-lg font-semibold text-[#4a170d] dark:text-text-primary">About this community</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#796f6b] dark:text-text-secondary">{group.description || "No description has been added yet."}</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Fact label="Visibility" value={group.visibility === "private" ? "Private — invitation only" : "Public — discoverable"} />
            <Fact label="Joining" value={group.joinPolicy === "request" ? "Owner/mod approval" : "Open joining"} />
            <Fact label="Members" value={group.memberCount.toLocaleString()} />
            <Fact label="Posts" value={group.messageCount.toLocaleString()} />
          </dl>
        </section>

        <section className="rounded-[22px] border border-[#f4dcc9] bg-white p-5 dark:border-subtle dark:bg-surface-layer">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-display text-lg font-semibold text-[#4a170d] dark:text-text-primary">Members</h2><p className="mt-1 text-xs text-[#796f6b] dark:text-text-secondary">Only active members appear here.</p></div>
            <span className="text-xs font-bold text-[#9a8278]">{group.memberCount}</span>
          </div>
          {loadingMembers ? <p className="mt-4 text-sm text-[#796f6b]">Loading members…</p> : (
            <div className="mt-4 divide-y divide-[#f4dcc9] dark:divide-subtle">
              {members.slice(0, 20).map((member) => (
                <div key={member.membership.id} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated">{member.profile.displayName.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#4a170d] dark:text-text-primary">{member.profile.displayName}</p><p className="text-xs capitalize text-[#796f6b] dark:text-text-secondary">{member.membership.role === "mod" ? "Moderator" : member.membership.role}</p></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        {canModerate ? (
          <section className="rounded-[22px] border border-[#f4dcc9] bg-white p-4 dark:border-subtle dark:bg-surface-layer">
            <h2 className="text-sm font-bold text-[#4a170d] dark:text-text-primary">Moderation</h2>
            <p className="mt-1 text-xs leading-5 text-[#796f6b] dark:text-text-secondary">Invite by the member's Edutu user ID. Private groups can only be entered through an invitation.</p>
            <div className="mt-3 flex gap-2">
              <input value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)} placeholder="user_…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#f4dcc9] px-3 text-sm dark:border-subtle dark:bg-surface-body" />
              <button
                type="button"
                disabled={!inviteUserId.trim() || working === "invite"}
                onClick={async () => {
                  setWorking("invite");
                  try {
                    await api.invite(group.id, inviteUserId.trim());
                    setInviteUserId("");
                  } catch (caught) {
                    onError(caught instanceof Error ? caught.message : "Invitation failed.");
                  } finally { setWorking(null); }
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f45b16] text-white disabled:opacity-50"
                aria-label="Invite member"
              ><UserPlus size={17} /></button>
            </div>
            <Link to={`/app/community/groups/${group.id}/requests`} className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-[#f4dcc9] px-3 text-sm font-bold text-[#6b4538] dark:border-subtle dark:text-text-secondary">
              Review join requests <UsersRound size={16} />
            </Link>
            <button type="button" onClick={() => void api.reportTarget("group", group.id, "Owner/mod review").catch(() => undefined)} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#796f6b]"><Flag size={15} /> Report issue</button>
          </section>
        ) : null}

        {membership?.status === "active" && !owner ? (
          <button type="button" disabled={working === "leave"} onClick={() => void leave()} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#f4dcc9] bg-white px-4 text-sm font-bold text-[#796f6b] dark:border-subtle dark:bg-surface-layer">Leave community</button>
        ) : null}

        {owner ? (
          <section className="rounded-[22px] border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
            <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><Archive size={17} /></span><div><p className="text-sm font-bold text-red-900 dark:text-red-200">Archive community</p><p className="mt-1 text-xs leading-5 text-red-700 dark:text-red-300">Permanent and irreversible. The room becomes read-only and frees one of your active group slots.</p></div></div>
            <button type="button" disabled={working === "archive" || Boolean(group.archivedAt)} onClick={() => void archive()} className="mt-3 min-h-11 w-full rounded-xl bg-red-700 px-3 text-sm font-bold text-white disabled:opacity-50">{group.archivedAt ? "Archived" : "Archive permanently"}</button>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a8278] dark:text-text-muted">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#4a170d] dark:text-text-primary">{value}</dd></div>;
}
