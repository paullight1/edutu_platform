import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  fetchMessages,
  isCommunityApiError,
  sendMessage,
  type CommunityMessage,
} from '@edutu/core/src/services/communities';
import type { GetAuthToken } from '@edutu/core/src/services/productApi';
import { subscribeToGroupMessages } from '@edutu/core/src/services/communityRealtime';

/**
 * One group's message list: REST pages plus the Realtime stream, reconciled.
 *
 * WHY THIS IS A HOOK AND NOT INLINE IN THE SCREEN
 * ----------------------------------------------
 * Two producers write into one list — `fetchMessages` pages backwards from the
 * newest message, and `subscribeToGroupMessages` pushes INSERTs and UPDATEs
 * forwards — and the rules for combining them are not obvious enough to be
 * retyped per screen. They are:
 *
 *   • UPSERT BY ID, never append. Realtime re-delivers on reconnect, and a page
 *     boundary can overlap a row already streamed in; appending shows the same
 *     message twice.
 *   • NEWEST FIRST, with `id` as the tiebreak. `created_at` is transaction time,
 *     so two rows written in one transaction sort identically and an unstable
 *     comparator makes them swap places on every re-render.
 *   • A SOFT-DELETED ROW STAYS PUT. Moderation blanks `body` and stamps
 *     `deleted_at` via an UPDATE; the row is deliberately kept so the tombstone
 *     can propagate. Filtering deleted rows out would make a moderated message
 *     vanish and silently reflow every message under it — the reader would never
 *     learn that something was removed.
 *
 * Written inline, the next screen that needs a message list would reinvent all
 * three, differently. `mergeMessages` is exported so those rules are testable
 * without a renderer.
 */

/** Backend caps a page at 50; 30 fills a phone screen with room to spare. */
export const MESSAGE_PAGE_SIZE = 30;

/** Namespaces optimistic ids so they can never collide with a server uuid. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic:';

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/**
 * A message as the list holds it. `pending` marks a send that has left the
 * composer but not yet been acknowledged, so the bubble can render at reduced
 * opacity instead of pretending the post already landed.
 */
export type LocalMessage = CommunityMessage & { pending?: boolean };

function timeOf(message: CommunityMessage): number {
  const parsed = Date.parse(message.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Newest first. The `id` tiebreak is not decoration: see the header — equal
 * timestamps are routine, and `Array.prototype.sort` is only stable for elements
 * the comparator calls equal, which would leave two same-instant messages free
 * to swap on any re-sort.
 */
export function compareNewestFirst(a: CommunityMessage, b: CommunityMessage): number {
  const delta = timeOf(b) - timeOf(a);
  if (delta !== 0) return delta;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * Fold `incoming` into `existing`: upsert by id, newest first, tombstones kept.
 *
 * `incoming` wins on conflict, because every producer that hands rows here is
 * more recent than what is on screen — a REST refetch and a Realtime UPDATE are
 * both later reads of the same row.
 */
export function mergeMessages(
  existing: LocalMessage[],
  incoming: CommunityMessage[],
): LocalMessage[] {
  if (incoming.length === 0) return existing;

  const byId = new Map<string, LocalMessage>();
  for (const message of existing) byId.set(message.id, message);

  for (const message of incoming) {
    if (!message || typeof message.id !== 'string') continue;
    const previous = byId.get(message.id);
    // Spreading the previous row first keeps local-only fields (`pending`) from
    // being erased by a server row that has never heard of them; the incoming
    // row then overwrites every server field, including `deletedAt`.
    byId.set(message.id, previous ? { ...previous, ...message } : message);
  }

  return Array.from(byId.values()).sort(compareNewestFirst);
}

export interface UseGroupMessagesParams {
  groupId: string;
  getAuthToken: GetAuthToken;
  /**
   * False for anyone who may not read this group — a `pending` applicant above
   * all. Gating here rather than in the screen means a non-member never issues
   * the request at all, so there is no window in which messages exist in state
   * for somebody who has not been let in.
   */
  enabled?: boolean;
  pageSize?: number;
  /** The caller's raw Clerk id, stamped onto optimistic rows. */
  userId?: string | null;
}

export interface UseGroupMessagesResult {
  messages: LocalMessage[];
  /** First page only. Drives the skeleton; later pages use `loadingMore`. */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  sending: boolean;
  sendError: string | null;
  /** The newest message's instant, or null — what the unread marker records. */
  newestAt: string | null;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  /** Resolves true when the post landed; false leaves the composer text alone. */
  send: (body: string) => Promise<boolean>;
  clearSendError: () => void;
  /** Fold a row the screen obtained itself (a delete's tombstone) into the list. */
  applyMessage: (message: CommunityMessage) => void;
}

export function useGroupMessages({
  groupId,
  getAuthToken,
  enabled = true,
  pageSize = MESSAGE_PAGE_SIZE,
  userId = null,
}: UseGroupMessagesParams): UseGroupMessagesResult {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Read inside async callbacks so paging never closes over a stale list.
  const messagesRef = useRef<LocalMessage[]>([]);
  // Held in a ref and called through a stable wrapper: Clerk's `getToken` is a
  // new function on some renders, and letting that identity into the focus
  // effect's dependency list would tear down and re-open the group's websocket
  // on an unrelated re-render.
  const tokenRef = useRef<GetAuthToken>(getAuthToken);
  const getToken = useCallback<GetAuthToken>(() => tokenRef.current(), []);

  // Mirrored in effects rather than during render: a ref write while rendering
  // is invisible to React and is what `react-hooks/refs` exists to stop.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    tokenRef.current = getAuthToken;
  }, [getAuthToken]);
  const optimisticCounter = useRef(0);
  // Guards against two pages in flight at once, which would send the same
  // keyset cursor twice and merge a duplicate page.
  const pagingRef = useRef(false);

  const apply = useCallback((incoming: CommunityMessage[]) => {
    setMessages((previous) => mergeMessages(previous, incoming));
  }, []);

  const applyMessage = useCallback(
    (message: CommunityMessage) => apply([message]),
    [apply],
  );

  const describe = useCallback(
    (caught: unknown) =>
      isCommunityApiError(caught) ? caught.message : "That didn't work. Please try again.",
    [],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !groupId) return;
    setError(null);
    try {
      const page = await fetchMessages(groupId, { limit: pageSize }, getToken);
      apply(page);
      setHasMore(page.length >= pageSize);
    } catch (caught) {
      setError(describe(caught));
    }
  }, [enabled, groupId, pageSize, getToken, apply, describe]);

  /**
   * KEYSET, not offset. `beforeId` travels with `before` on every request: the
   * cursor is the pair `(created_at, id)`, and sending the instant alone drops
   * every row that shares the boundary timestamp — which is exactly what a
   * system message written alongside a user message looks like.
   */
  const loadOlder = useCallback(async () => {
    if (!enabled || !groupId || !hasMore || pagingRef.current) return;

    // Optimistic rows have a client clock and no server cursor, so the boundary
    // is the oldest row the *server* gave us.
    const persisted = messagesRef.current.filter((message) => !isOptimisticId(message.id));
    const oldest = persisted[persisted.length - 1];
    if (!oldest) return;

    pagingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(
        groupId,
        { before: oldest.createdAt, beforeId: oldest.id, limit: pageSize },
        getToken,
      );
      apply(page);
      setHasMore(page.length >= pageSize);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      pagingRef.current = false;
      setLoadingMore(false);
    }
  }, [enabled, groupId, hasMore, pageSize, getToken, apply, describe]);

  // ── First page ─────────────────────────────────────────────────────────────
  // On focus rather than on mount: a chat left behind a pushed screen should be
  // current when it comes back, and this is the same lifecycle the socket uses,
  // so the two can never disagree about whether this group is being watched.
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !groupId) {
        setLoading(false);
        return undefined;
      }
      let cancelled = false;
      setLoading(true);
      void (async () => {
        try {
          const page = await fetchMessages(groupId, { limit: pageSize }, getToken);
          if (cancelled) return;
          apply(page);
          setHasMore(page.length >= pageSize);
        } catch (caught) {
          if (!cancelled) setError(describe(caught));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled, groupId, pageSize, getToken, apply, describe]),
  );

  // ── Realtime ───────────────────────────────────────────────────────────────
  // SUBSCRIBE ON FOCUS, UNSUBSCRIBE ON BLUR. `useFocusEffect`'s cleanup runs on
  // blur, not just unmount; a bare `useEffect` would hold this group's websocket
  // open for as long as the screen stayed mounted behind whatever the user
  // pushed on top of it. See the header of services/communityRealtime.ts.
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !groupId) return undefined;
      let opportunityReload: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = subscribeToGroupMessages(groupId, (message) => {
        // Realtime emits the raw row; the REST response carries the validated
        // opportunity card. Coalesce hydration so bursts do not create N+1 reads.
        if (message.kind === 'opportunity' && !message.opportunity) {
          apply([message]);
          if (opportunityReload === null) {
            opportunityReload = setTimeout(() => {
              opportunityReload = null;
              void refresh();
            }, 100);
          }
          return;
        }
        apply([message]);
      });
      return () => {
        if (opportunityReload !== null) clearTimeout(opportunityReload);
        unsubscribe();
      };
    }, [enabled, groupId, apply, refresh]),
  );

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!trimmed || !groupId || sending) return false;

      optimisticCounter.current += 1;
      const optimisticId = `${OPTIMISTIC_ID_PREFIX}${optimisticCounter.current}`;
      const optimistic: LocalMessage = {
        id: optimisticId,
        groupId,
        userId: userId ?? '',
        body: trimmed,
        kind: 'text',
        opportunityId: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deletedBy: null,
        pending: true,
      };

      setSendError(null);
      setSending(true);
      setMessages((previous) => mergeMessages(previous, [optimistic]));

      try {
        const saved = await sendMessage(groupId, { body: trimmed }, getToken);
        setMessages((previous) =>
          mergeMessages(
            previous.filter((message) => message.id !== optimisticId),
            [saved],
          ),
        );
        return true;
      } catch (caught) {
        // Roll the optimistic row back and surface the SERVER'S sentence. The
        // screener refuses with copy written for the member ("…it reads like
        // it's asking for money…"); replacing it with a generic failure is what
        // makes somebody retype the same blocked message forever.
        setMessages((previous) => previous.filter((message) => message.id !== optimisticId));
        setSendError(describe(caught));
        return false;
      } finally {
        setSending(false);
      }
    },
    [groupId, sending, userId, getToken, describe],
  );

  const clearSendError = useCallback(() => setSendError(null), []);

  const newestAt = useMemo(() => {
    for (const message of messages) {
      if (!isOptimisticId(message.id)) return message.createdAt;
    }
    return null;
  }, [messages]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    sending,
    sendError,
    newestAt,
    refresh,
    loadOlder,
    send,
    clearSendError,
    applyMessage,
  };
}
