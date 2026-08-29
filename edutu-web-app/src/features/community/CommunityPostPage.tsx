import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, isCommunityApiError } from "./api";
import type {
  CommunityMessage,
  CommunityPostThread,
  GroupDetail,
} from "./types";
import CommunityComposer from "./components/CommunityComposer";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import MessageBubble from "./components/MessageBubble";

export default function CommunityPostPage() {
  const { id = "", postId = "" } = useParams<{
    id: string;
    postId: string;
  }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [thread, setThread] = useState<CommunityPostThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([api.getGroup(id), api.fetchPostThread(id, postId)])
      .then(([nextDetail, nextThread]) => {
        if (!active) return;
        const status = nextDetail.membership?.status;
        const ownerFallback =
          nextDetail.group.ownerId === userId &&
          status !== "removed" &&
          status !== "banned";
        if (status !== "active" && !ownerFallback) {
          setError("Join this community to view its posts.");
          return;
        }
        setDetail(nextDetail);
        setThread(nextThread);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          isCommunityApiError(caught) || caught instanceof Error
            ? caught.message
            : "This post could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, id, postId, userId]);

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setComposerError(null);
    try {
      const comment = await api.sendComment(id, postId, { body });
      setThread((current) =>
        current
          ? {
              post: {
                ...current.post,
                commentCount: (current.post.commentCount ?? 0) + 1,
              },
              comments: [...current.comments, comment],
            }
          : current,
      );
      setDraft("");
    } catch (caught) {
      setComposerError(
        caught instanceof Error
          ? caught.message
          : "That comment could not be posted.",
      );
    } finally {
      setSending(false);
    }
  };

  const toggleLike = async (message: CommunityMessage) => {
    if (!thread || message.id !== thread.post.id) return;
    const previous = thread.post;
    const optimistic = {
      ...previous,
      viewerHasLiked: !previous.viewerHasLiked,
      likeCount: Math.max(
        0,
        (previous.likeCount ?? 0) + (previous.viewerHasLiked ? -1 : 1),
      ),
    };
    setThread({ ...thread, post: optimistic });
    try {
      const reaction = previous.viewerHasLiked
        ? await api.unlikeMessage(previous.id)
        : await api.likeMessage(previous.id);
      setThread((current) =>
        current
          ? { ...current, post: { ...current.post, ...reaction } }
          : current,
      );
    } catch (caught) {
      setThread((current) =>
        current ? { ...current, post: previous } : current,
      );
      setComposerError(
        caught instanceof Error ? caught.message : "The like could not be saved.",
      );
    }
  };

  if (loading) {
    return (
      <CommunityProductShell title="Post" description="Loading post…">
        <CommunityState kind="loading" />
      </CommunityProductShell>
    );
  }

  if (!detail || !thread || error) {
    return (
      <CommunityProductShell
        title="Post unavailable"
        description={error || "This post could not be opened."}
      >
        <div className="py-14 text-center">
          <p className="mx-auto max-w-sm text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
            {error || "This post may have been removed."}
          </p>
          <Link
            to={`/app/community/groups/${encodeURIComponent(id)}`}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#17120f] px-5 text-sm font-bold text-white dark:bg-text-primary dark:text-surface-body"
          >
            Back to community
          </Link>
        </div>
      </CommunityProductShell>
    );
  }

  const canComment =
    detail.membership?.status === "active" && !detail.group.archivedAt;

  return (
    <>
      <Seo
        title={`Post in ${detail.group.name} | Edutu Community`}
        description={thread.post.body.slice(0, 150)}
        path={`/app/community/groups/${detail.group.id}/posts/${thread.post.id}`}
        noindex
      />
      <CommunityProductShell
        title="Post"
        description={`Post and comments in ${detail.group.name}.`}
      >
        <main className="-mx-4 bg-white pb-[calc(7rem+env(safe-area-inset-bottom))] sm:-mx-5 dark:bg-surface-body">
          <section
            aria-label="Selected post"
            className="border-b-8 border-[#f5f2f0] dark:border-surface-elevated"
          >
            <MessageBubble
              message={thread.post}
              mine={thread.post.userId === userId}
              canDelete={false}
              onToggleLike={(message) => void toggleLike(message)}
            />
          </section>
          <section className="px-4 pt-5 sm:px-5">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-[#f45b16]" />
              <h2 className="font-display text-lg font-bold text-[#17120f] dark:text-text-primary">
                Comments
              </h2>
              <span className="text-xs font-semibold text-[#817a76] dark:text-text-muted">
                {thread.comments.length}
              </span>
            </div>
          </section>
          {thread.comments.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-semibold text-[#5f5752] dark:text-text-secondary">
                No comments yet
              </p>
              <p className="mt-1 text-sm text-[#817a76] dark:text-text-muted">
                Be the first to add something useful.
              </p>
            </div>
          ) : (
            <div role="feed" aria-label="Post comments" className="py-1">
              {thread.comments.map((comment) => (
                <MessageBubble
                  key={comment.id}
                  message={comment}
                  mine={comment.userId === userId}
                  canDelete={false}
                />
              ))}
            </div>
          )}
        </main>
        {canComment ? (
          <CommunityComposer
            mode="comment"
            draft={draft}
            setDraft={setDraft}
            error={composerError}
            sending={sending}
            onSubmit={() => void submitComment()}
          />
        ) : null}
      </CommunityProductShell>
    </>
  );
}
