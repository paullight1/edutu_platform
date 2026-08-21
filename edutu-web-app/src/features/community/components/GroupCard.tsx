import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, MessagesSquare, UsersRound } from "lucide-react";
import GroupAvatar from "./GroupAvatar";
import { formatCommunityTime, membershipLabel } from "../format";
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
    <article className="group relative flex min-h-[156px] flex-col rounded-[22px] border border-[#f4dcc9] bg-white p-4 shadow-[0_8px_28px_-24px_rgba(74,23,13,.5)] transition hover:-translate-y-0.5 hover:border-[#f45b16]/35 hover:shadow-[0_18px_38px_-30px_rgba(74,23,13,.6)] dark:border-subtle dark:bg-surface-layer">
      <div className="flex items-start gap-3">
        <GroupAvatar emoji={group.coverEmoji} name={group.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-[-0.02em] text-[#4a170d] dark:text-text-primary sm:text-lg">
              {group.name}
            </h2>
            <ArrowUpRight size={17} className="mt-0.5 shrink-0 text-[#b08372] transition group-hover:text-[#f45b16] dark:text-text-muted" />
          </div>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClasses}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {group.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-[#796f6b] dark:text-text-secondary">
          {group.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-xs font-medium text-[#8d7b74] dark:text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound size={14} /> {group.memberCount.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessagesSquare size={14} /> {group.messageCount.toLocaleString()}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Clock3 size={14} className="shrink-0" />
          <span className="truncate">{formatCommunityTime(group.lastMessageAt || group.createdAt)}</span>
        </span>
      </div>

      <Link
        to={`/app/community/groups/${group.id}`}
        className="absolute inset-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40 focus-visible:ring-offset-2"
        aria-label={`Open ${group.name}`}
      />
    </article>
  );
}
