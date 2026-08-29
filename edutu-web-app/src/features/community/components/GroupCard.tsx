import { Link } from "react-router-dom";
import { ArrowRight, MessagesSquare } from "lucide-react";
import CommunityProtectedImage from "../../../components/CommunityProtectedImage";
import { getCommunityFallbackCover } from "../communityCover";
import { formatCommunityCount, membershipLabel } from "../format";
import type { GroupWithMembership } from "../types";

export default function GroupCard({ row }: { row: GroupWithMembership }) {
  const { group, membership } = row;
  const status = membership?.status ?? null;
  const statusLabel = membershipLabel(status);
  const statusClasses =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "invited"
        ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
        : status === "pending"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          : "bg-[#fcead5] text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary";

  return (
    <article className="group bg-white transition-colors hover:bg-[#fff8f4] sm:rounded-[22px] sm:border sm:border-[#ece8e5] sm:shadow-[0_12px_32px_-28px_rgba(74,23,13,.45)] dark:sm:border-subtle dark:bg-surface-layer dark:hover:bg-surface-elevated">
      <Link
        to={`/app/community/groups/${group.id}`}
        className="flex min-h-[124px] items-center gap-4 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f45b16]/45"
        aria-label={`Open ${group.name}`}
      >
        <span className="relative flex h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-2xl bg-[#fcead5] dark:bg-surface-elevated">
          {group.coverImageResourceUrl ? (
            <CommunityProtectedImage
              resourceUrl={group.coverImageResourceUrl}
              alt={`${group.name} cover`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <img
              src={getCommunityFallbackCover(
                `${group.name} ${group.description ?? ""}`,
              )}
              alt={`${group.name} community`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-balance font-display text-lg font-bold leading-[1.2] tracking-[-0.025em] text-[#17120f] dark:text-text-primary sm:text-xl">
                {group.name}
              </span>
              <span className="mt-1 block text-base font-semibold tabular-nums text-[#697177] dark:text-text-secondary">
                {formatCommunityCount(group.memberCount)} members
              </span>
            </span>
            <ArrowRight
              size={18}
              className="mt-1 shrink-0 text-[#b5aba5] transition group-hover:translate-x-0.5 group-hover:text-[#f45b16]"
            />
          </span>

          {group.description ? (
            <span className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#645d59] dark:text-text-secondary">
              {group.description}
            </span>
          ) : null}

          <span className="mt-2 flex items-center gap-3 text-xs font-medium text-[#8b817c] dark:text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MessagesSquare size={14} />{" "}
              {formatCommunityCount(group.messageCount)} posts
            </span>
            {status ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses}`}
              >
                {statusLabel}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </article>
  );
}
