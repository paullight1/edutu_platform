import { Link } from "react-router-dom";
import { FileText, Image as ImageIcon, PhoneCall, Trash2 } from "lucide-react";
import { formatCommunityTime } from "../format";
import { parseCommunityAttachment, type CommunityMessage } from "../types";

export default function MessageBubble({
  message,
  mine,
  canDelete,
  onDelete,
  onOpenAttachment,
}: {
  message: CommunityMessage;
  mine: boolean;
  canDelete: boolean;
  onDelete?: (message: CommunityMessage) => void;
  onOpenAttachment?: (message: CommunityMessage) => void;
}) {
  const author = message.author?.displayName || "Edutu member";
  const deleted = Boolean(message.deletedAt);
  const attachment = parseCommunityAttachment(message.kind, message.body);

  if (message.kind === "call" && message.callId) {
    return (
      <article className="my-3 rounded-[20px] border border-[#f4dcc9] bg-white p-4 shadow-sm dark:border-subtle dark:bg-surface-layer">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><PhoneCall size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#4a170d] dark:text-text-primary">Community call</p>
            <p className="mt-1 text-sm leading-5 text-[#796f6b] dark:text-text-secondary">A live or scheduled call is attached to this conversation.</p>
            <Link
              to={`/communities/calls/${message.callId}`}
              className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#f45b16] px-3 text-xs font-bold text-white"
            >
              Open call
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`group flex gap-2.5 py-2 ${mine ? "flex-row-reverse" : ""}`}>
      <div
        aria-hidden="true"
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary"
      >
        {author.slice(0, 1).toUpperCase()}
      </div>
      <div className={`min-w-0 max-w-[min(82%,680px)] ${mine ? "items-end text-right" : ""}`}>
        <div className={`mb-1 flex items-baseline gap-2 ${mine ? "justify-end" : ""}`}>
          <span className="truncate text-xs font-bold text-[#6b4538] dark:text-text-secondary">{mine ? "You" : author}</span>
          <time className="shrink-0 text-[11px] text-[#a18c83] dark:text-text-muted">{formatCommunityTime(message.createdAt)}</time>
        </div>
        <div
          className={`relative overflow-hidden rounded-[18px] px-3.5 py-2.5 text-left text-[15px] leading-6 shadow-sm sm:text-base ${
            mine
              ? "rounded-tr-md bg-[#f45b16] text-white"
              : "rounded-tl-md border border-[#f4dcc9] bg-white text-[#4a170d] dark:border-subtle dark:bg-surface-layer dark:text-text-primary"
          }`}
        >
          {deleted ? (
            <p className={`italic ${mine ? "text-white/75" : "text-[#9a8278] dark:text-text-muted"}`}>Message removed</p>
          ) : attachment ? (
            <button
              type="button"
              onClick={() => onOpenAttachment?.(message)}
              className="flex min-h-12 w-full items-center gap-3 text-left"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mine ? "bg-white/15" : "bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"}`}>
                {message.kind === "image" ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{attachment.name}</span>
                {attachment.caption ? <span className={`mt-0.5 block text-xs ${mine ? "text-white/80" : "text-[#796f6b] dark:text-text-secondary"}`}>{attachment.caption}</span> : null}
              </span>
            </button>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
        </div>
        {!deleted && canDelete && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(message)}
            aria-label="Delete message"
            className={`mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-[#a18c83] opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:text-red-600 ${mine ? "ml-auto" : ""}`}
          >
            <Trash2 size={12} /> Remove
          </button>
        ) : null}
      </div>
    </article>
  );
}
