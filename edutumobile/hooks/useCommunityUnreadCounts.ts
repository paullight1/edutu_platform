import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGroups,
  fetchMessages,
  type GroupWithMembership,
} from '@edutu/core/src/services/communities';
import { fetchDmConversations } from '@edutu/core/src/services/communityDms';
import type { GetAuthToken } from '@edutu/core/src/services/productApi';
import { subscribeToCommunityGroupInbox } from '@edutu/core/src/services/communityRealtime';
import {
  isAfterCursor,
  readGroupReadMap,
} from '../lib/communityReadState';

export type CommunityUnreadCounts = {
  groupsUnreadCount: number;
  chatsUnreadCount: number;
  groupUnreadCounts: Record<string, number>;
};

const EMPTY_COUNTS: CommunityUnreadCounts = {
  groupsUnreadCount: 0,
  chatsUnreadCount: 0,
  groupUnreadCounts: {},
};

type Settled<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );
}

function activeGroups(rows: GroupWithMembership[]): GroupWithMembership[] {
  return rows.filter((row) => row.membership?.status === 'active');
}

/**
 * Counts are based on the same backend data rendered by Groups and Chats.
 * Group messages are refreshed from the one Supabase realtime inbox channel;
 * the short API refresh is only a recovery path for DM delivery or a dropped
 * socket, not the primary update mechanism.
 */
export function useCommunityUnreadCounts(
  userId: string | null | undefined,
  getAuthToken: GetAuthToken,
): CommunityUnreadCounts {
  const [counts, setCounts] = useState<CommunityUnreadCounts>(EMPTY_COUNTS);
  const getAuthTokenRef = useRef(getAuthToken);
  const countsRef = useRef(counts);

  // Clear a previous account's badges as soon as the identity changes, before
  // the new account's async reconciliation starts. Keep the reset in an effect
  // so concurrent rendering never mutates state during render.
  const previousUserIdRef = useRef(userId);
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    countsRef.current = EMPTY_COUNTS;
    setCounts(EMPTY_COUNTS);
  }, [userId]);

  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);

  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCounts(EMPTY_COUNTS);
      return;
    }

    // These are independent sources. A temporary DM outage must not erase
    // accurate group counts (or vice versa), so reconcile them separately and
    // keep the last-known value for the failed branch.
    const [groupsSettled, dmsSettled, readMapSettled] = await Promise.all([
      settle(fetchGroups({ mine: true, limit: 50 }, getAuthTokenRef.current)),
      settle(fetchDmConversations({ limit: 50 }, getAuthTokenRef.current)),
      settle(readGroupReadMap()),
    ]);

    const groups = groupsSettled.status === 'fulfilled'
      ? activeGroups(groupsSettled.value)
      : [];
    const readMap = readMapSettled.status === 'fulfilled' ? readMapSettled.value : {};
    const nextGroupCounts: Record<string, number> = {};

    // There are currently at most two active groups per member. Reading the
    // newest page gives a real message count instead of turning every room
    // into a made-up boolean dot. If that page cannot be loaded, preserve a
    // truthful one-or-zero fallback from the group's live last-message time.
    await Promise.all(
      groups.map(async ({ group }) => {
        const cursor = readMap[group.id];
        if (!isAfterCursor(group.lastMessageAt, cursor)) return;
        try {
          const messages = await fetchMessages(
            group.id,
            { limit: 50 },
            getAuthTokenRef.current,
          );
          const unread = messages.filter(
            (message) =>
              message.userId !== userId &&
              isAfterCursor(message.createdAt, cursor),
          ).length;
          if (unread > 0) nextGroupCounts[group.id] = unread;
        } catch {
          nextGroupCounts[group.id] = 1;
        }
      }),
    );

    const chatsUnreadCount = dmsSettled.status === 'fulfilled'
      ? dmsSettled.value.reduce(
          (total, conversation) =>
            total + Math.max(0, conversation.unreadCount || 0),
          0,
        )
      : countsRef.current.chatsUnreadCount;
    setCounts({
      groupsUnreadCount: groupsSettled.status === 'fulfilled'
        ? Object.values(nextGroupCounts).reduce((a, b) => a + b, 0)
        : countsRef.current.groupsUnreadCount,
      chatsUnreadCount,
      groupUnreadCounts: groupsSettled.status === 'fulfilled'
        ? nextGroupCounts
        : countsRef.current.groupUnreadCounts,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackInterval: ReturnType<typeof setInterval> | undefined;

    const runRefresh = () => {
      void refresh().catch(() => {
        // Badges are additive UI; the last good value is safer than flashing
        // zero while a request is temporarily unavailable.
      });
    };
    const scheduleRefresh = () => {
      if (!active || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        runRefresh();
      }, 80);
    };

    runRefresh();
    const unsubscribe = subscribeToCommunityGroupInbox(scheduleRefresh);
    // Reconciles DMs and recovers from a websocket/API interruption.
    fallbackInterval = setInterval(runRefresh, 5000);

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackInterval) clearInterval(fallbackInterval);
      unsubscribe();
    };
  }, [refresh, userId]);

  return counts;
}
