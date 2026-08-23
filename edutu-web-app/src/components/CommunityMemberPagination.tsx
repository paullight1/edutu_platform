import { useEffect, useMemo, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useClerk } from "../hooks/useAuth";
import {
  fetchGroupMembers,
  isCommunityApiError,
  type CommunityMemberCursor,
  type CommunityMemberSummary,
} from "../services/community";

type Props = {
  groupId: string;
  initialMembers: CommunityMemberSummary[];
  hasMore: boolean;
  totalCount: number;
  currentUserId: string | null | undefined;
  onBlock: (member: CommunityMemberSummary) => Promise<void>;
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "E"
  );
}

function mergeMembers(
  current: CommunityMemberSummary[],
  incoming: CommunityMemberSummary[],
): CommunityMemberSummary[] {
  const byId = new Map(current.map((member) => [member.membership.id, member]));
  incoming.forEach((member) => byId.set(member.membership.id, member));
  return [...byId.values()];
}

function cursorFromLastMember(
  members: CommunityMemberSummary[],
  hasMore: boolean,
): CommunityMemberCursor | null {
  if (!hasMore) return null;
  const last = [...members]
    .reverse()
    .find((member) => member.membership.status === "active");
  if (!last) return null;
  return {
    role: last.membership.role,
    joinedAt: last.membership.joinedAt,
    id: last.membership.id,
  };
}

export default function CommunityMemberPagination({
  groupId,
  initialMembers,
  hasMore,
  totalCount,
  currentUserId,
  onBlock,
}: Props) {
  const { getToken } = useClerk();
  const firstCursor = useMemo(
    () => cursorFromLastMember(initialMembers, hasMore),
    [hasMore, initialMembers],
  );
  const firstCursorKey = firstCursor
    ? `${firstCursor.role}|${firstCursor.joinedAt}|${firstCursor.id}`
    : "";
  const [additionalMembers, setAdditionalMembers] = useState<CommunityMemberSummary[]>([]);
  const [cursor, setCursor] = useState<CommunityMemberCursor | null>(firstCursor);
  const [moreAvailable, setMoreAvailable] = useState(Boolean(hasMore && firstCursor));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAdditionalMembers([]);
    setCursor(firstCursor);
    setMoreAvailable(Boolean(hasMore && firstCursor));
    setError(null);
  }, [firstCursorKey, groupId, hasMore]);

  const loadMore = async () => {
    if (!cursor || !moreAvailable || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchGroupMembers(groupId, getToken, 100, cursor);
      const active = page.members.filter(
        (member) => member.membership.status === "active",
      );
      setAdditionalMembers((current) => mergeMembers(current, active));
      setCursor(page.nextCursor);
      setMoreAvailable(Boolean(page.hasMore && page.nextCursor));
      if (page.hasMore && !page.nextCursor) {
        setError("More members exist, but the next roster page could not be opened.");
      }
    } catch (cause) {
      setError(
        isCommunityApiError(cause)
          ? cause.message
          : "More members could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  };

  const block = async (member: CommunityMemberSummary) => {
    await onBlock(member);
    setAdditionalMembers((current) =>
      current.filter(
        (row) => row.membership.userId !== member.membership.userId,
      ),
    );
  };

  const visibleCount = initialMembers.length + additionalMembers.length;
  if (!additionalMembers.length && !moreAvailable && !error) return null;

  return (
    <div className="mt-5">
      {moreAvailable ? (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-text-secondary"
        >
          Showing {visibleCount} of {totalCount} active members.
        </div>
      ) : null}

      {additionalMembers.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {additionalMembers.map((member) => (
            <article
              key={member.membership.id}
              className="flex items-center gap-3 rounded-[24px] border border-subtle bg-surface-layer p-4 shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-sm font-semibold">
                {initials(member.profile.displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {member.profile.displayName}
                </p>
                <p className="mt-1 text-xs capitalize text-text-muted">
                  {member.membership.role}
                </p>
              </div>
              {member.membership.userId !== currentUserId ? (
                <div className="flex gap-1">
                  <Link
                    to={`/app/community/messages?user=${encodeURIComponent(member.membership.userId)}`}
                    className="inline-flex min-h-10 items-center rounded-xl border border-subtle px-3 text-xs font-semibold"
                  >
                    Message
                  </Link>
                  <button
                    type="button"
                    onClick={() => void block(member)}
                    aria-label={`Block ${member.profile.displayName}`}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-subtle text-text-muted hover:text-danger"
                  >
                    <Ban size={15} />
                  </button>
                </div>
              ) : (
                <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  You
                </span>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {moreAvailable && cursor ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-subtle bg-surface-layer px-5 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Load more members
          </button>
        </div>
      ) : null}
    </div>
  );
}
