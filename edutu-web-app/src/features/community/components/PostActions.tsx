import { useState } from "react";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function PostActions({
  postHref,
  title,
  likeCount,
  commentCount,
  viewerHasLiked,
  onToggleLike,
}: {
  postHref: string;
  title: string;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  onToggleLike?: () => void;
}) {
  const [shareStatus, setShareStatus] = useState("");

  const share = async () => {
    const url = new URL(postHref, window.location.origin).toString();
    setShareStatus("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        setShareStatus("Post shared");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Link copied");
      } else {
        throw new Error("Sharing is unavailable");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setShareStatus("Could not share this post");
    }
  };

  const actionClass =
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition hover:bg-[#f3f1ef] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/30 dark:hover:bg-surface-elevated";

  return (
    <div className="mt-3 flex items-center gap-1 border-t border-[#eee9e6] pt-2 text-[#6f6762] dark:border-subtle dark:text-text-secondary">
      <button
        type="button"
        aria-label={viewerHasLiked ? "Unlike post" : "Like post"}
        aria-pressed={viewerHasLiked}
        onClick={onToggleLike}
        className={`${actionClass} ${viewerHasLiked ? "text-[#f45b16] dark:text-brand" : ""}`}
      >
        <Heart size={16} fill={viewerHasLiked ? "currentColor" : "none"} />
        <span>{likeCount}</span>
      </button>
      <Link
        to={postHref}
        aria-label={`${commentCount} comments`}
        className={actionClass}
      >
        <MessageCircle size={16} />
        <span>{commentCount}</span>
      </Link>
      <button
        type="button"
        aria-label="Share post"
        onClick={() => void share()}
        className={actionClass}
      >
        <Share2 size={16} />
        <span>Share</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {shareStatus}
      </span>
    </div>
  );
}
