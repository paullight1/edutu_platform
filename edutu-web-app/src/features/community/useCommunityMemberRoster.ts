import { useCallback, useEffect, useState } from "react";
import type { CommunityApi } from "./api";
import type {
  CommunityMemberCursor,
  CommunityMemberSummary,
} from "./types";

function mergeMembers(
  current: CommunityMemberSummary[],
  incoming: CommunityMemberSummary[],
): CommunityMemberSummary[] {
  const byId = new Map(
    current.map((member) => [member.membership.id, member] as const),
  );
  for (const member of incoming) byId.set(member.membership.id, member);
  return [...byId.values()];
}

export function useCommunityMemberRoster(
  api: CommunityApi,
  groupId: string,
  enabled = true,
  pageSize = 50,
) {
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [cursor, setCursor] = useState<CommunityMemberCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMembers([]);
    setCursor(null);
    setHasMore(false);
    setError(null);

    if (!enabled || !groupId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void api
      .getMembers(groupId, pageSize, null)
      .then((page) => {
        if (!active) return;
        setMembers(page.members);
        setHasMore(page.hasMore && Boolean(page.nextCursor));
        setCursor(page.hasMore ? page.nextCursor : null);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Community members could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, enabled, groupId, pageSize]);

  const loadMore = useCallback(async () => {
    if (!enabled || !groupId || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.getMembers(groupId, pageSize, cursor);
      setMembers((current) => mergeMembers(current, page.members));
      setHasMore(page.hasMore && Boolean(page.nextCursor));
      setCursor(page.hasMore ? page.nextCursor : null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "More community members could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [api, cursor, enabled, groupId, hasMore, loadingMore, pageSize]);

  return {
    members,
    setMembers,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  };
}
