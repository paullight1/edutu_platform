import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  FileText,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  MoreHorizontal,
  Pin,
  PhoneCall,
  Trash2,
} from "lucide-react";
import { formatCommunityTime } from "../format";
import {
  requestCommunityAuthorBlock,
  requestCommunityMessageReport,
} from "../messageActions";
import { parseCommunityAttachment, type CommunityMessage } from "../types";
import PostActions from "./PostActions";

export default function MessageBubble({
  message,
  mine,
  canDelete,
  onDelete,
  onOpenAttachment,
  onReport,
  onBlock,
  onToggleLike,
  canPin = false,
  onPin,
  showEngagement = true,
}: {
  message: CommunityMessage;
  mine: boolean;
  canDelete: boolean;
  onDelete?: (message: CommunityMessage) => void;
  onOpenAttachment?: (message: CommunityMessage) => void;
  onReport?: (message: CommunityMessage) => void;
  onBlock?: (message: CommunityMessage) => void;
  onToggleLike?: (message: CommunityMessage) => void;
  canPin?: boolean;
  onPin?: (message: CommunityMessage, pinned: boolean) => void;
  showEngagement?: boolean;
}) {
  const author = message.author?.displayName || "Edutu member";
  const deleted = Boolean(message.deletedAt);
  const attachment = parseCommunityAttachment(message.kind, message.body);
  const [actionsOpen, setActionsOpen] = useState(false);

  if (message.kind === "call" && message.callId) {
    return (
      <article className="mx-3 my-2 rounded-[22px] bg-[#faf8f7] px-4 py-5 dark:bg-surface-elevated sm:mx-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f1ef] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
            <PhoneCall size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#4a170d] dark:text-text-primary">
              Community call
            </p>
            <p className="mt-1 text-sm leading-5 text-[#796f6b] dark:text-text-secondary">
              A live or scheduled call is attached to this conversation.
            </p>
            <Link
              to={`/communities/calls/${message.callId}`}
              className="mt-3 inline-flex min-h-10 items-center rounded-full bg-[#17120f] px-4 text-xs font-bold text-white transition hover:bg-[#f45b16] dark:bg-text-primary dark:text-surface-body"
            >
              Open call
            </Link>
          </div>
        </div>
      </article>
    );
  }

  const showSafetyActions = !mine && !deleted;
  const report = () => {
    if (onReport) onReport(message);
    else requestCommunityMessageReport(message);
    setActionsOpen(false);
  };
  const block = () => {
    if (onBlock) onBlock(message);
    else requestCommunityAuthorBlock(message);
    setActionsOpen(false);
  };
  const topLevelPost = message.parentMessageId == null;
  const hasActions =
    !deleted && (canDelete || showSafetyActions || (topLevelPost && canPin));
  const postHref = `/app/community/groups/${message.groupId}/posts/${message.id}`;

  return (
    <article className="group relative flex gap-3 px-4 py-5 transition-colors hover:bg-[#faf8f7]/70 dark:hover:bg-surface-elevated/45 sm:px-5">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#eeeae7] text-sm font-bold text-[#5a514c] ring-1 ring-black/[0.035] dark:bg-surface-elevated dark:text-text-secondary dark:ring-white/[0.04]"
      >
        {message.author?.avatarUrl ? (
          <img
            src={message.author.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          author.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 pe-10">
          <span className="truncate text-sm font-bold text-[#17120f] dark:text-text-primary">
            {mine ? "You" : author}
          </span>
          <time className="shrink-0 text-xs tabular-nums text-[#817a76] dark:text-text-muted">
            {formatCommunityTime(message.createdAt)}
          </time>
        </div>
        <div className="relative mt-1 overflow-hidden text-start text-[15px] leading-6 text-[#2f2926] dark:text-text-primary sm:text-base">
          {deleted ? (
            <p className="italic text-[#9a928d] dark:text-text-muted">
              Message removed
            </p>
          ) : message.kind === "opportunity" && message.opportunity ? (
            <Link
              to={`/app/opportunity/${encodeURIComponent(message.opportunity.id)}`}
              aria-label={`Open opportunity: ${message.opportunity.title}`}
              className="mt-2 block overflow-hidden rounded-2xl border border-[#e8e2de] bg-[#fffaf7] p-4 transition hover:border-[#f45b16]/45 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/30 dark:border-subtle dark:bg-surface-elevated"
            >
              <span className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff0e8] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
                  <GraduationCap size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#f45b16] dark:text-brand">
                    Opportunity
                  </span>
                  <span className="mt-1 block text-base font-bold leading-5 text-[#17120f] dark:text-text-primary">
                    {message.opportunity.title}
                  </span>
                  {message.opportunity.organization ? (
                    <span className="mt-1 block text-xs text-[#746c67] dark:text-text-secondary">
                      {message.opportunity.organization}
                    </span>
                  ) : null}
                  {message.opportunity.deadline ||
                  message.opportunity.location ? (
                    <span className="mt-2 block text-xs font-semibold text-[#6b4538] dark:text-text-secondary">
                      {[
                        message.opportunity.location,
                        message.opportunity.deadline,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </span>
              </span>
              {message.body && message.body !== message.opportunity.title ? (
                <span className="mt-3 block border-t border-[#eee7e2] pt-3 text-sm dark:border-subtle">
                  {message.body}
                </span>
              ) : null}
            </Link>
          ) : attachment ? (
            <button
              type="button"
              onClick={() => onOpenAttachment?.(message)}
              className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#e3dedb] bg-[#faf8f7] p-2.5 text-start transition hover:border-[#f45b16]/35 dark:border-subtle dark:bg-surface-elevated"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0e8] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
                {message.kind === "image" ? (
                  <ImageIcon size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">
                  {attachment.name}
                </span>
                {attachment.caption ? (
                  <span className="mt-0.5 block text-xs text-[#756d68] dark:text-text-secondary">
                    {attachment.caption}
                  </span>
                ) : null}
              </span>
            </button>
          ) : topLevelPost && showEngagement ? (
            <Link
              to={postHref}
              className="block whitespace-pre-wrap break-words rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/30"
            >
              {message.body}
            </Link>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
        </div>
        {!deleted && topLevelPost && showEngagement ? (
          <PostActions
            postHref={postHref}
            title={`${author}'s post in Edutu Community`}
            likeCount={message.likeCount ?? 0}
            commentCount={message.commentCount ?? 0}
            viewerHasLiked={message.viewerHasLiked ?? false}
            onToggleLike={() => onToggleLike?.(message)}
          />
        ) : null}
        {hasActions ? (
          <div className="absolute end-3 top-3 sm:end-4">
            <button
              type="button"
              aria-label={`Post actions for ${author}`}
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
              onClick={() => setActionsOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#817a76] opacity-70 transition hover:bg-[#eeeae7] hover:text-[#17120f] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 group-hover:opacity-100 dark:text-text-muted dark:hover:bg-surface-elevated dark:hover:text-text-primary"
            >
              <MoreHorizontal size={18} />
            </button>
            {actionsOpen ? (
              <div
                role="menu"
                aria-label={`Actions for ${author}'s post`}
                className="absolute end-0 top-10 z-20 min-w-40 overflow-hidden rounded-2xl border border-[#e8e2de] bg-white p-1.5 shadow-[0_16px_40px_-18px_rgba(35,24,18,.42)] dark:border-subtle dark:bg-surface-layer dark:shadow-[0_18px_42px_-18px_rgba(0,0,0,.82)]"
              >
                {showSafetyActions ? (
                  <button
                    type="button"
                    onClick={report}
                    aria-label="Report message"
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-xs font-semibold text-[#5f5752] transition hover:bg-amber-50 hover:text-amber-700 dark:text-text-secondary dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                  >
                    <Flag size={14} /> Report post
                  </button>
                ) : null}
                {topLevelPost && canPin && onPin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onPin(message, !message.pinnedAt);
                    }}
                    aria-label={message.pinnedAt ? "Unpin post" : "Pin post"}
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-xs font-semibold text-[#5f5752] transition hover:bg-[#fff0e8] hover:text-[#f45b16] dark:text-text-secondary dark:hover:bg-brand/10 dark:hover:text-brand"
                  >
                    <Pin size={14} />{" "}
                    {message.pinnedAt ? "Unpin post" : "Pin post"}
                  </button>
                ) : null}
                {showSafetyActions ? (
                  <button
                    type="button"
                    onClick={block}
                    aria-label={`Block ${author}`}
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-xs font-semibold text-[#5f5752] transition hover:bg-red-50 hover:text-red-600 dark:text-text-secondary dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    <Ban size={14} /> Block member
                  </button>
                ) : null}
                {canDelete && onDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onDelete(message);
                    }}
                    aria-label="Delete message"
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={14} /> Remove post
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
