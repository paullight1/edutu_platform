import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Archive,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  Flag,
  Globe2,
  Loader2,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Seo from "../../components/Seo";
import CommunityProtectedImage from "../../components/CommunityProtectedImage";
import { CommunityApi, isCommunityApiError } from "./api";
import { useGroupMessages } from "./useGroupMessages";
import { useCommunityMemberRoster } from "./useCommunityMemberRoster";
import type {
  CommunityGroupResource,
  CommunityMessage,
  GroupDetail,
  GroupForm,
  JoinRequestAnswer,
} from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import GroupAvatar from "./components/GroupAvatar";
import MessageBubble from "./components/MessageBubble";
import CommunityActionSheet from "./components/CommunityActionSheet";
import CommunityComposer from "./components/CommunityComposer";
import { getCommunityFallbackCover } from "./communityCover";
import {
  formatCommunityCount,
  formatCommunityTime,
  groupTimingLabel,
} from "./format";

const FIRST_POST_KEY = "edutu:web:community:first-post-safety:v1";
type Tab = "posts" | "resources" | "about";

export default function CommunityGroupPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = params.get("tab");
  const tab: Tab =
    requestedTab === "resources" || requestedTab === "about"
      ? requestedTab
      : "posts";
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pinnedPreview, setPinnedPreview] =
    useState<CommunityMessage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunityMessage | null>(
    null,
  );
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
  const canPreview =
    Boolean(group) &&
    (group?.visibility === "public" ||
      status === "active" ||
      status === "invited");
  const canReadContent = Boolean(
    group &&
      (status === "active" ||
        (group.ownerId === userId &&
          status !== "removed" &&
          status !== "banned")),
  );
  const canPost = status === "active" && !group?.archivedAt;
  const canModerate = Boolean(
    userId &&
    group &&
    ((group.ownerId === userId &&
      status !== "removed" &&
      status !== "banned") ||
      (status === "active" &&
        (membership?.role === "owner" || membership?.role === "mod"))),
  );
  const owner = Boolean(
    userId &&
    group &&
    group.ownerId === userId &&
    status !== "removed" &&
    status !== "banned",
  );

  const messages = useGroupMessages({
    api,
    groupId: id,
    enabled: canReadContent,
  });

  useEffect(() => {
    let active = true;
    if (!group || canReadContent || !canPreview) {
      setPinnedPreview(null);
      setPreviewLoading(false);
      return () => {
        active = false;
      };
    }
    setPreviewLoading(true);
    void api
      .fetchPinnedPost(group.id)
      .then((post) => {
        if (active) setPinnedPreview(post);
      })
      .catch(() => {
        if (active) setPinnedPreview(null);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, canPreview, canReadContent, group]);

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
      setComposerError(
        caught instanceof Error
          ? caught.message
          : "That message could not be sent.",
      );
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
      setDetailError(
        caught instanceof Error
          ? caught.message
          : "We couldn't update your membership.",
      );
    } finally {
      setBusy(null);
    }
  };

  const deleteMessage = async (message: CommunityMessage) => {
    setBusy(`delete:${message.id}`);
    try {
      const updated = (await api.deleteMessage(message.id)) as CommunityMessage;
      messages.replace(updated);
    } catch (caught) {
      setComposerError(
        caught instanceof Error
          ? caught.message
          : "The message could not be removed.",
      );
    } finally {
      setBusy(null);
      setDeleteTarget(null);
    }
  };

  const toggleLike = async (message: CommunityMessage) => {
    const previous = message;
    const optimistic = {
      ...message,
      viewerHasLiked: !message.viewerHasLiked,
      likeCount: Math.max(
        0,
        (message.likeCount ?? 0) + (message.viewerHasLiked ? -1 : 1),
      ),
    };
    messages.replace(optimistic);
    setComposerError(null);
    try {
      const reaction = message.viewerHasLiked
        ? await api.unlikeMessage(message.id)
        : await api.likeMessage(message.id);
      messages.replace({ ...optimistic, ...reaction });
    } catch (caught) {
      messages.replace(previous);
      setComposerError(
        caught instanceof Error ? caught.message : "The like could not be saved.",
      );
    }
  };

  const setPinned = async (message: CommunityMessage, pinned: boolean) => {
    setComposerError(null);
    try {
      const updated = await api.pinMessage(message.id, pinned);
      messages.replace(updated);
      await messages.reload();
    } catch (caught) {
      setComposerError(
        caught instanceof Error ? caught.message : "The pin could not be updated.",
      );
    }
  };

  const openAttachment = async (message: CommunityMessage) => {
    try {
      const body = JSON.parse(message.body) as { url?: unknown };
      if (typeof body.url !== "string")
        throw new Error("That attachment is unavailable.");
      const resolved = await api.resolveAttachmentUrl(body.url);
      const url = new URL(resolved.url);
      if (url.protocol !== "https:")
        throw new Error("That attachment is unavailable.");
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch (caught) {
      setComposerError(
        caught instanceof Error
          ? caught.message
          : "That attachment is unavailable.",
      );
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
          body={
            detailError ||
            "It may be private, removed, or temporarily unavailable."
          }
          actionLabel="Back to Explore"
          onAction={() => navigate("/app/community/explore")}
        />
      </CommunityProductShell>
    );
  }

  const timing = groupTimingLabel(group);
  const contentTab: Tab =
    !canReadContent && tab === "resources" ? "posts" : tab;
  const contentTabs: Tab[] = canReadContent
    ? ["posts", "resources", "about"]
    : ["posts", "about"];

  return (
    <>
      <Seo
        title={`${group.name} | Edutu Community`}
        description={
          group.description || `Open ${group.name} in Edutu Community.`
        }
        path={`/app/community/groups/${group.id}`}
        noindex
      />
      <CommunityProductShell
        title={group.name}
        restingTitle="Community"
        titleAnchorId="community-group-title"
        description={group.description || "A focused Edutu community room."}
        action={
          <Link
            to={`/app/community/groups/${group.id}?tab=about${canModerate ? "&admin=1" : ""}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#17120f] transition hover:bg-[#f7f4f2] hover:text-[#f45b16] active:scale-95 dark:text-text-primary dark:hover:bg-surface-elevated"
            aria-label="Community menu"
          >
            {canModerate ? <Settings size={18} /> : <MoreHorizontal size={20} />}
          </Link>
        }
      >
        <section className="-mx-4 bg-white dark:bg-surface-body sm:-mx-5 sm:overflow-hidden sm:rounded-b-[28px]">
          <div className="relative h-36 overflow-hidden bg-[radial-gradient(circle_at_15%_20%,#ffb27f_0%,transparent_36%),linear-gradient(135deg,#3f1d12_0%,#7a2e14_48%,#f45b16_100%)] sm:h-48">
            {group.coverImageResourceUrl ? (
              <CommunityProtectedImage
                resourceUrl={group.coverImageResourceUrl}
                alt={`${group.name} cover`}
                loading="eager"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={getCommunityFallbackCover(
                  `${group.name} ${group.description ?? ""}`,
                )}
                alt={`${group.name} community`}
                loading="eager"
                className="h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_44%,rgba(14,9,7,.28)_100%)]" />
          </div>

          <div className="px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="relative z-10 -mt-8 flex items-end justify-between gap-4">
              <div className="rounded-[22px] bg-white p-1.5 shadow-[0_10px_28px_-18px_rgba(35,24,18,.48)] dark:bg-surface-body dark:shadow-[0_12px_30px_-18px_rgba(0,0,0,.9)]">
                <GroupAvatar
                  emoji={group.coverEmoji}
                  name={group.name}
                  size="lg"
                />
              </div>
              <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#f3f1ef] px-3 py-1.5 text-xs font-semibold text-[#5f5752] dark:bg-surface-elevated dark:text-text-secondary">
                {group.visibility === "private" ? (
                  <LockKeyhole size={13} />
                ) : (
                  <Globe2 size={13} />
                )}
                {group.visibility === "private" ? "Private" : "Public"}
              </span>
            </div>

            <h1
              id="community-group-title"
              className="mt-3 max-w-[22ch] text-balance font-display text-[1.75rem] font-bold leading-[1.06] tracking-[-0.045em] text-[#17120f] dark:text-text-primary sm:text-4xl"
            >
              {group.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold tabular-nums text-[#17120f] dark:text-text-primary">
                {formatCommunityCount(group.memberCount)} Members
              </span>
              <span
                aria-hidden="true"
                className="text-[#b7b0ab] dark:text-text-muted"
              >
                ·
              </span>
              <span className="font-medium tabular-nums text-[#76706c] dark:text-text-muted">
                {formatCommunityCount(group.messageCount)} posts
              </span>
              {timing ? (
                <span className="font-medium text-[#76706c] dark:text-text-muted">
                  {timing}
                </span>
              ) : null}
            </div>
            <p className="mt-3 max-w-[62ch] whitespace-pre-wrap text-[15px] font-medium leading-6 text-[#403934] dark:text-text-secondary sm:text-base">
              {group.description || "A focused Edutu community room."}
            </p>
            <p className="mt-2 max-w-[68ch] text-xs font-medium leading-5 text-[#817a76] dark:text-text-muted">
              {group.joinPolicy === "request"
                ? "Membership requests are reviewed by community moderators."
                : "Anyone on Edutu can join this community."}{" "}
              Active{" "}
              {formatCommunityTime(group.lastMessageAt || group.createdAt)}.
            </p>

            <MembershipAction
              detail={detail}
              busy={busy === "join"}
              error={detailError}
              onJoin={join}
            />
          </div>
        </section>

        <div
          className={`sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mb-0 grid ${contentTabs.length === 3 ? "grid-cols-3" : "grid-cols-2"} bg-white/90 px-2 shadow-[0_1px_0_rgba(68,55,47,.08)] backdrop-blur-xl sm:-mx-5 dark:bg-surface-body/90 dark:shadow-[0_1px_0_rgba(255,255,255,.06)]`}
          role="tablist"
          aria-label="Community content"
        >
          {contentTabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={contentTab === item}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (item === "posts") next.delete("tab");
                else next.set("tab", item);
                setParams(next, { replace: true });
              }}
              className={`relative min-h-[3.25rem] px-3 text-sm font-semibold transition ${
                contentTab === item
                  ? "text-[#17120f] dark:text-text-primary"
                  : "text-[#817a76] hover:text-[#332d29] dark:text-text-muted dark:hover:text-text-primary"
              }`}
            >
              {item === "posts"
                ? "Posts"
                : item === "resources"
                  ? "Resources"
                  : "About"}
              {contentTab === item ? (
                <span className="absolute inset-x-[24%] bottom-0 h-[3px] rounded-full bg-[#f45b16] dark:bg-brand" />
              ) : null}
            </button>
          ))}
        </div>

        {contentTab === "posts" ? (
          canReadContent ? (
            <PostsPanel
            groupId={id}
            userId={userId ?? null}
            membershipRole={membership?.role ?? null}
            canModerate={canModerate}
            canPost={canPost}
            firstPostAccepted={firstPostAccepted}
            onAcceptFirstPost={() => {
              setFirstPostAccepted(true);
              try {
                window.localStorage.setItem(FIRST_POST_KEY, "1");
              } catch {
                /* optional */
              }
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
            onDelete={setDeleteTarget}
            onOpenAttachment={(message) => void openAttachment(message)}
            onToggleLike={(message) => void toggleLike(message)}
            onPin={(message, pinned) => void setPinned(message, pinned)}
          />
          ) : (
            <CommunityPreviewPanel
              post={pinnedPreview}
              loading={previewLoading}
              userId={userId ?? null}
            />
          )
        ) : contentTab === "resources" ? (
          <ResourcesPanel
            api={api}
            groupId={id}
            enabled={canReadContent}
            onError={setComposerError}
          />
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
      <CommunityActionSheet
        open={deleteTarget !== null}
        title="Remove message"
        description="The message will be replaced by a moderation tombstone."
        confirmLabel="Remove"
        busy={Boolean(deleteTarget && busy === `delete:${deleteTarget.id}`)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteMessage(deleteTarget);
        }}
      />
      <CommunityActionSheet
        open={messages.blockTarget !== null}
        title={`Block ${messages.blockTarget?.author?.displayName || "member"}`}
        description="Their community messages will be hidden on this account."
        confirmLabel="Block"
        busy={messages.blockBusy}
        onClose={messages.cancelBlock}
        onConfirm={() => void messages.confirmBlock()}
      />
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
        <div>
          <p className="font-bold">Waiting for approval</p>
          <p className="mt-0.5 leading-5">
            An owner or moderator still needs to review your request. You cannot
            post until it is approved.
          </p>
        </div>
      </div>
    );
  }
  if (status === "banned") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
        <ShieldAlert size={17} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">You cannot rejoin this community</p>
          <p className="mt-0.5 leading-5">
            This is a moderator decision, so Edutu does not show a retry action.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {status === "invited" ? (
        <p className="mb-3 text-sm leading-6 text-[#6b4538] dark:text-text-secondary">
          <strong>You were invited.</strong> You can preview this room before
          accepting.
        </p>
      ) : null}
      {!showForm ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startJoin()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#17120f] px-5 text-sm font-bold text-white transition hover:bg-[#f45b16] active:scale-[0.98] disabled:opacity-60 dark:bg-text-primary dark:text-surface-body"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          {status === "invited"
            ? "Accept invitation"
            : group.joinPolicy === "request"
              ? "Request to join"
              : "Join community"}
        </button>
      ) : (
        <div className="space-y-4 rounded-2xl bg-[#fff9f1] p-4 dark:bg-surface-elevated">
          <div>
            <p className="font-bold text-[#4a170d] dark:text-text-primary">
              Request to join
            </p>
            <p className="mt-1 text-xs leading-5 text-[#796f6b] dark:text-text-secondary">
              Answer only what the owners need to decide whether this group
              fits.
            </p>
          </div>
          {formLoading ? (
            <p className="text-sm text-[#796f6b]">Loading questions…</p>
          ) : null}
          {(form?.questions ?? []).map((question) => (
            <label key={question.id} className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#4a170d] dark:text-text-primary">
                {question.label}
                {question.required ? " *" : ""}
              </span>
              {question.type === "single_select" ? (
                <select
                  value={answers[question.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-xl border border-[#f4dcc9] bg-white px-3 text-sm dark:border-subtle dark:bg-surface-layer"
                >
                  <option value="">Choose one</option>
                  {question.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  value={answers[question.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  rows={question.type === "long_text" ? 4 : 2}
                  className="w-full rounded-xl border border-[#f4dcc9] bg-white px-3 py-2 text-sm dark:border-subtle dark:bg-surface-layer"
                />
              )}
            </label>
          ))}
          {error ? (
            <p className="text-xs font-semibold text-red-600">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-11 rounded-xl border border-[#f4dcc9] px-4 text-sm font-bold dark:border-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                busy ||
                (form?.questions ?? []).some(
                  (question) =>
                    question.required && !(answers[question.id] ?? "").trim(),
                )
              }
              onClick={() =>
                void onJoin(
                  (form?.questions ?? [])
                    .map((question) => ({
                      id: question.id,
                      value: (answers[question.id] ?? "").trim(),
                    }))
                    .filter((answer) => answer.value),
                )
              }
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
  onToggleLike,
  onPin,
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
  onToggleLike: (message: CommunityMessage) => void;
  onPin: (message: CommunityMessage, pinned: boolean) => void;
}) {
  const messageEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      previousMessageCount.current = null;
      return;
    }

    const previous = previousMessageCount.current;
    previousMessageCount.current = messages.length;
    if (previous === null || messages.length <= previous) return;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    messageEndRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [loading, messages.length]);

  return (
    <section className="-mx-4 bg-white pb-[calc(7rem+env(safe-area-inset-bottom))] sm:-mx-5 dark:bg-surface-body">
      <div
        role="feed"
        aria-label="Community posts"
        className="flex min-h-[420px] flex-col py-1"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="animate-spin text-[#f45b16]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
              <MessageCircle size={21} />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-[#4a170d] dark:text-text-primary">
              Start with something useful
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
              Ask a focused question, share what you learned, or help someone
              unblock an application.
            </p>
          </div>
        ) : (
          <>
            {hasMore ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="mx-auto mb-3 min-h-10 rounded-xl px-3 text-xs font-bold text-[#f45b16] disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load earlier posts"}
              </button>
            ) : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mine={message.userId === userId}
                canDelete={Boolean(
                  message.userId === userId ||
                  canModerate ||
                  membershipRole === "owner",
                )}
                onDelete={onDelete}
                onOpenAttachment={onOpenAttachment}
                onToggleLike={onToggleLike}
                canPin={canModerate || membershipRole === "owner"}
                onPin={onPin}
              />
            ))}
          </>
        )}
        <div
          ref={messageEndRef}
          aria-hidden="true"
          className="h-px scroll-mb-[calc(8rem+env(safe-area-inset-bottom))]"
        />
      </div>

      {canPost ? (
        <CommunityComposer
          mode="post"
          draft={draft}
          setDraft={setDraft}
          error={composerError}
          sending={sending}
          onSubmit={onSend}
          safetyAccepted={firstPostAccepted}
          onAcceptSafety={onAcceptFirstPost}
        />
      ) : null}
    </section>
  );
}

function CommunityPreviewPanel({
  post,
  loading,
  userId,
}: {
  post: CommunityMessage | null;
  loading: boolean;
  userId: string | null;
}) {
  return (
    <section className="-mx-4 bg-white px-4 py-5 sm:-mx-5 sm:px-5 dark:bg-surface-body">
      {loading ? (
        <div className="flex min-h-28 items-center justify-center">
          <Loader2 className="animate-spin text-[#f45b16]" />
        </div>
      ) : post ? (
        <div className="overflow-hidden rounded-[24px] border border-[#ece6e2] bg-white shadow-sm dark:border-subtle dark:bg-surface-layer">
          <p className="px-4 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f45b16] dark:text-brand">
            Pinned post
          </p>
          <MessageBubble
            message={post}
            mine={post.userId === userId}
            canDelete={false}
            showEngagement={false}
          />
        </div>
      ) : null}
      <div className="mt-5 rounded-[24px] bg-[#fff3e9] px-5 py-6 text-center dark:bg-brand/10">
        <h2 className="font-display text-xl font-bold text-[#4a170d] dark:text-text-primary">
          Join to view more
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
          Become a member to read every post, comment, and shared resource.
        </p>
      </div>
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
  const [cursor, setCursor] = useState<{
    before: string;
    beforeId: string;
  } | null>(null);

  const load = useCallback(
    async (more = false) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const page = await api.fetchResources(groupId, {
          before: more ? cursor?.before : undefined,
          beforeId: more ? cursor?.beforeId : undefined,
          limit: 30,
        });
        setResources((current) =>
          more
            ? [
                ...current,
                ...page.resources.filter(
                  (next) => !current.some((row) => row.id === next.id),
                ),
              ]
            : page.resources,
        );
        setCursor(page.nextCursor);
      } catch (caught) {
        onError(
          caught instanceof Error
            ? caught.message
            : "Resources could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [api, cursor?.before, cursor?.beforeId, enabled, groupId, onError],
  );

  useEffect(() => {
    void load(false);
    // Initial resource page only; cursor changes should not refetch page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, enabled, groupId]);

  if (!enabled)
    return (
      <CommunityState
        kind="empty"
        title="Resources are not available"
        body="Join or accept your invitation to access protected group resources."
      />
    );
  if (loading && resources.length === 0)
    return <CommunityState kind="loading" />;
  if (resources.length === 0)
    return (
      <CommunityState
        kind="empty"
        title="No shared resources yet"
        body="Images and PDF files shared in this room will collect here so they do not disappear in chat history."
      />
    );

  return (
    <div className="space-y-3">
      {resources.map((resource) => (
        <button
          key={resource.id}
          type="button"
          onClick={async () => {
            try {
              const result = await api.resolveAttachmentUrl(
                resource.attachment.url,
              );
              window.open(result.url, "_blank", "noopener,noreferrer");
            } catch (caught) {
              onError(
                caught instanceof Error
                  ? caught.message
                  : "That resource is unavailable.",
              );
            }
          }}
          className="flex min-h-20 w-full items-center gap-3 rounded-[20px] border border-[#f4dcc9] bg-white p-3 text-start shadow-sm transition hover:border-[#f45b16]/30 dark:border-subtle dark:bg-surface-layer"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
            <FileText size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[#4a170d] dark:text-text-primary">
              {resource.attachment.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[#796f6b] dark:text-text-secondary">
              {resource.sender.displayName} ·{" "}
              {formatCommunityTime(resource.createdAt)}
            </span>
          </span>
          <ExternalLink size={16} className="shrink-0 text-[#a18c83]" />
        </button>
      ))}
      {cursor ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
          className="mx-auto block min-h-10 rounded-xl px-4 text-sm font-bold text-[#f45b16]"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
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
  const roster = useCommunityMemberRoster(api, group.id, true, 20);
  const [inviteUserId, setInviteUserId] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [destructiveAction, setDestructiveAction] = useState<
    "leave" | "archive" | null
  >(null);
  const navigate = useNavigate();

  const leave = async () => {
    if (!userId || !membership) return;
    setWorking("leave");
    try {
      await api.leaveGroup(group.id, userId);
      navigate("/app/community/groups", { replace: true });
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "You could not leave this community.",
      );
    } finally {
      setWorking(null);
      setDestructiveAction(null);
    }
  };

  const archive = async () => {
    setWorking("archive");
    try {
      await api.archiveGroup(group.id);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "This community could not be archived.",
      );
    } finally {
      setWorking(null);
      setDestructiveAction(null);
    }
  };

  return (
    <div className="-mx-4 sm:-mx-5">
      <div className="space-y-2 pb-6">
        <section className="bg-white px-4 py-6 dark:bg-surface-body sm:px-5">
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-[#17120f] dark:text-text-primary">
            Community info
          </h2>
          <div className="mt-4 space-y-5">
            <InfoRow
              icon={<UsersRound size={22} />}
              title={
                membership?.status === "active"
                  ? "You can post in this community"
                  : "Only community members can post"
              }
              body={`${formatCommunityCount(group.memberCount)} members are learning and sharing here.`}
            />
            <InfoRow
              icon={
                group.visibility === "private" ? (
                  <LockKeyhole size={22} />
                ) : (
                  <Globe2 size={22} />
                )
              }
              title={
                group.visibility === "private"
                  ? "Private community"
                  : "Publicly discoverable"
              }
              body={
                group.visibility === "private"
                  ? "Only invited Edutu members can open this community."
                  : "Anyone on Edutu can find and preview this community."
              }
            />
            <InfoRow
              icon={<Check size={22} />}
              title={
                group.joinPolicy === "request"
                  ? "Approval required to join"
                  : "Open to join"
              }
              body={
                group.joinPolicy === "request"
                  ? "An owner or moderator reviews each membership request."
                  : "Edutu members can join immediately."
              }
            />
            <InfoRow
              icon={<CalendarDays size={22} />}
              title={`Created ${new Date(group.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
              body={`${formatCommunityCount(group.messageCount)} posts shared so far.`}
            />
          </div>
        </section>

        <section className="bg-white px-4 py-6 dark:bg-surface-body sm:px-5">
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-[#17120f] dark:text-text-primary">
            Community standards
          </h2>
          <ol aria-label="Community standards" className="mt-4 space-y-2">
            <Rule
              number="1"
              title="Be kind and useful"
              body="Give specific feedback, share sources and respect different starting points."
            />
            <Rule
              number="2"
              title="Protect private information"
              body="Never post passwords, verification codes, identity documents or another person's details."
            />
            <Rule
              number="3"
              title="Keep money requests out"
              body="Do not ask members for fees, transfers or off-platform payments. Report suspicious messages to Edutu."
            />
          </ol>
        </section>

        <section className="bg-white px-4 py-6 dark:bg-surface-body sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-[#17120f] dark:text-text-primary">
                Members
              </h2>
              <p className="mt-1 text-sm text-[#756d68] dark:text-text-secondary">
                Active members in this community.
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-[#817a76]">
              {formatCommunityCount(group.memberCount)}
            </span>
          </div>
          {roster.loading ? (
            <p className="mt-4 text-sm text-[#796f6b]">Loading members…</p>
          ) : (
            <ul aria-label="Community members" className="mt-4 space-y-1">
              {roster.members.map((member) => (
                <li
                  key={member.membership.id}
                  className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[#f7f5f3] dark:hover:bg-surface-elevated"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ece8e5] text-sm font-bold text-[#5a514c] dark:bg-surface-elevated">
                    {member.profile.avatarUrl ? (
                      <img
                        src={member.profile.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      member.profile.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#17120f] dark:text-text-primary">
                      {member.profile.displayName}
                    </p>
                    <p className="text-xs capitalize text-[#756d68] dark:text-text-secondary">
                      {member.membership.role === "mod"
                        ? "Moderator"
                        : member.membership.role}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {roster.error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {roster.error}
            </p>
          ) : null}
          {roster.hasMore ? (
            <button
              type="button"
              disabled={roster.loadingMore}
              onClick={() => void roster.loadMore()}
              className="mx-auto mt-3 block min-h-10 rounded-xl px-4 text-sm font-bold text-[#f45b16] disabled:opacity-50"
            >
              {roster.loadingMore ? "Loading…" : "Load more members"}
            </button>
          ) : null}
        </section>
      </div>

      <aside className="space-y-4 px-4 py-5 sm:px-5">
        {canModerate ? (
          <section className="rounded-[22px] border border-[#f4dcc9] bg-white p-4 dark:border-subtle dark:bg-surface-layer">
            <h2 className="text-sm font-bold text-[#4a170d] dark:text-text-primary">
              Moderation
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#796f6b] dark:text-text-secondary">
              Invite by the member's Edutu user ID. Private groups can only be
              entered through an invitation.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={inviteUserId}
                onChange={(event) => setInviteUserId(event.target.value)}
                placeholder="user_…"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#f4dcc9] px-3 text-sm dark:border-subtle dark:bg-surface-body"
              />
              <button
                type="button"
                disabled={!inviteUserId.trim() || working === "invite"}
                onClick={async () => {
                  setWorking("invite");
                  try {
                    await api.invite(group.id, inviteUserId.trim());
                    setInviteUserId("");
                  } catch (caught) {
                    onError(
                      caught instanceof Error
                        ? caught.message
                        : "Invitation failed.",
                    );
                  } finally {
                    setWorking(null);
                  }
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f45b16] text-white disabled:opacity-50"
                aria-label="Invite member"
              >
                <UserPlus size={17} />
              </button>
            </div>
            <Link
              to={`/app/community/groups/${group.id}/requests`}
              className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-[#f4dcc9] px-3 text-sm font-bold text-[#6b4538] dark:border-subtle dark:text-text-secondary"
            >
              Review join requests <UsersRound size={16} />
            </Link>
            <button
              type="button"
              onClick={() =>
                void api
                  .reportTarget("group", group.id, "Owner/mod review")
                  .catch(() => undefined)
              }
              className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#796f6b]"
            >
              <Flag size={15} /> Report issue
            </button>
          </section>
        ) : null}

        {membership?.status === "active" && !owner ? (
          <button
            type="button"
            disabled={working === "leave"}
            onClick={() => setDestructiveAction("leave")}
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#f4dcc9] bg-white px-4 text-sm font-bold text-[#796f6b] dark:border-subtle dark:bg-surface-layer"
          >
            Leave community
          </button>
        ) : null}

        {owner ? (
          <section className="rounded-[22px] border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                <Archive size={17} />
              </span>
              <div>
                <p className="text-sm font-bold text-red-900 dark:text-red-200">
                  Archive community
                </p>
                <p className="mt-1 text-xs leading-5 text-red-700 dark:text-red-300">
                  Permanent and irreversible. The room becomes read-only and
                  frees one of your active group slots.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={working === "archive" || Boolean(group.archivedAt)}
              onClick={() => setDestructiveAction("archive")}
              className="mt-3 min-h-11 w-full rounded-xl bg-red-700 px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {group.archivedAt ? "Archived" : "Archive permanently"}
            </button>
          </section>
        ) : null}
      </aside>
      <CommunityActionSheet
        open={destructiveAction !== null}
        title={
          destructiveAction === "archive"
            ? "Archive community"
            : "Leave community"
        }
        description={
          destructiveAction === "archive"
            ? "Archiving is permanent and makes this room read-only."
            : "You may need to request access again later."
        }
        confirmLabel={destructiveAction === "archive" ? "Archive" : "Leave"}
        busy={working === destructiveAction}
        onClose={() => setDestructiveAction(null)}
        onConfirm={() => {
          if (destructiveAction === "archive") void archive();
          else if (destructiveAction === "leave") void leave();
        }}
      />
    </div>
  );
}

function InfoRow({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 flex w-8 shrink-0 justify-center text-[#68737a] dark:text-text-muted">
        {icon}
      </span>
      <div>
        <p className="text-base font-bold leading-5 text-[#17120f] dark:text-text-primary">
          {title}
        </p>
        <p className="mt-1 text-sm leading-5 text-[#655e59] dark:text-text-secondary">
          {body}
        </p>
      </div>
    </div>
  );
}

function Rule({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4 rounded-2xl px-1 py-3 transition-colors hover:bg-[#f7f5f3] dark:hover:bg-surface-elevated">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#17120f] text-sm font-bold text-white dark:bg-text-primary dark:text-surface-body">
        {number}
      </span>
      <div>
        <p className="text-base font-bold leading-5 text-[#17120f] dark:text-text-primary">
          {title}
        </p>
        <p className="mt-1 text-sm leading-5 text-[#655e59] dark:text-text-secondary">
          {body}
        </p>
      </div>
    </li>
  );
}
