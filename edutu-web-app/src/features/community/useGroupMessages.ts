import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunityApi } from "./api";
import {
  addLocalBlockedAuthor,
  persistLocalBlockedAuthors,
  readLocalBlockedAuthors,
} from "./blockState";
import { subscribeCommunityMessageActions } from "./messageActions";
import { subscribeToGroupMessages } from "./realtime";
import type { CommunityMessage } from "./types";

function mergeMessages(
  current: CommunityMessage[],
  incoming: CommunityMessage[],
): CommunityMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(
      message.id,
      existing?.author && !message.author
        ? { ...message, author: existing.author }
        : message,
    );
  }
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function useGroupMessages({
  api,
  groupId,
  enabled,
}: {
  api: CommunityApi;
  groupId: string;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(
    () => new Set(readLocalBlockedAuthors()),
  );
  const [blocksReady, setBlocksReady] = useState(false);
  const [blockTarget, setBlockTarget] = useState<CommunityMessage | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !groupId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const version = ++requestVersion.current;
    setError(null);
    try {
      const page = await api.fetchMessages(groupId, { limit: 40 });
      if (version !== requestVersion.current) return;
      setMessages((current) => mergeMessages([], page.length ? page : current));
      setHasMore(page.length >= 40);
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Messages could not be loaded.",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [api, enabled, groupId]);

  useEffect(() => {
    setLoading(enabled);
    setMessages([]);
    setHasMore(true);
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [enabled, groupId, load]);

  useEffect(() => {
    if (!enabled || !groupId) {
      setBlocksReady(false);
      return;
    }
    let active = true;
    setBlocksReady(false);
    void api
      .listBlocks()
      .then((rows) => {
        if (!active) return;
        setBlockedIds((current) => {
          const next = new Set(current);
          for (const row of rows) next.add(row.userId);
          persistLocalBlockedAuthors(next);
          return next;
        });
        setBlocksReady(true);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Your blocked-member list could not be loaded.",
        );
        setBlocksReady(false);
      });
    return () => {
      active = false;
    };
  }, [api, enabled, groupId]);

  useEffect(() => {
    if (!enabled || !groupId || !blocksReady) return;
    let opportunityReload: number | null = null;
    const unsubscribe = subscribeToGroupMessages(groupId, (message) => {
      if (blockedIds.has(message.userId)) return;
      // Realtime carries the raw database row, while opportunity cards are a
      // public-catalog projection added by the API. Re-read the current page
      // instead of rendering an unverified id or issuing one fetch per card.
      if (message.kind === "opportunity" && !message.opportunity) {
        setMessages((current) => mergeMessages(current, [message]));
        if (opportunityReload === null) {
          opportunityReload = window.setTimeout(() => {
            opportunityReload = null;
            void load();
          }, 100);
        }
        return;
      }
      setMessages((current) => mergeMessages(current, [message]));
    });
    return () => {
      if (opportunityReload !== null) window.clearTimeout(opportunityReload);
      unsubscribe();
    };
  }, [blockedIds, blocksReady, enabled, groupId, load]);

  useEffect(() => {
    if (!enabled || !groupId) return;
    return subscribeCommunityMessageActions({
      onReport: (message) => {
        if (message.groupId !== groupId) return;
        void api
          .reportTarget(
            "message",
            message.id,
            "Reported from the community conversation.",
          )
          .catch((caught) => {
            setError(
              caught instanceof Error
                ? caught.message
                : "That report could not be submitted.",
            );
          });
      },
      onBlock: (message) => {
        if (message.groupId !== groupId) return;
        setBlockTarget(message);
      },
    });
  }, [api, enabled, groupId]);

  const confirmBlock = useCallback(async () => {
    if (!blockTarget || blockBusy) return;
    setBlockBusy(true);
    try {
      await api.blockUser(blockTarget.userId);
      addLocalBlockedAuthor(blockTarget.userId);
      setBlockedIds((current) => {
        const next = new Set(current);
        next.add(blockTarget.userId);
        return next;
      });
      setBlockTarget(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That member could not be blocked.",
      );
    } finally {
      setBlockBusy(false);
    }
  }, [api, blockBusy, blockTarget]);

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || loadingMore || messages.length === 0) return;
    const oldest = messages[0];
    setLoadingMore(true);
    try {
      const page = await api.fetchMessages(groupId, {
        before: oldest.createdAt,
        beforeId: oldest.id,
        limit: 40,
      });
      setMessages((current) => mergeMessages(current, page));
      setHasMore(page.length >= 40);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Older messages could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [api, enabled, groupId, hasMore, loadingMore, messages]);

  const append = useCallback((message: CommunityMessage) => {
    setMessages((current) => mergeMessages(current, [message]));
  }, []);

  const replace = useCallback((message: CommunityMessage) => {
    setMessages((current) => mergeMessages(current, [message]));
  }, []);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !blockedIds.has(message.userId)),
    [blockedIds, messages],
  );
  const newestAt = useMemo(
    () => visibleMessages[visibleMessages.length - 1]?.createdAt ?? null,
    [visibleMessages],
  );

  return {
    messages: visibleMessages,
    loading,
    loadingMore,
    hasMore,
    error,
    newestAt,
    reload: load,
    loadMore,
    append,
    replace,
    blockTarget,
    blockBusy,
    cancelBlock: () => setBlockTarget(null),
    confirmBlock,
  };
}
