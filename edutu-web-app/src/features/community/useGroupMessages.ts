import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunityApi } from "./api";
import { subscribeCommunityMessageActions } from "./messageActions";
import { subscribeToGroupMessages } from "./realtime";
import type { CommunityMessage } from "./types";

const LOCAL_BLOCKS_KEY = "edutu:web:community:blocked-authors:v1";

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

function readLocalBlockedAuthors(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_BLOCKS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : [];
  } catch {
    return [];
  }
}

function persistLocalBlockedAuthors(ids: Set<string>) {
  try {
    window.localStorage.setItem(LOCAL_BLOCKS_KEY, JSON.stringify([...ids]));
  } catch {
    // Server-side blocks remain authoritative; local persistence is the
    // second layer that also filters Supabase Realtime on this browser.
  }
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
        caught instanceof Error ? caught.message : "Messages could not be loaded.",
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
        // Fail closed for Realtime. REST history is already filtered server-side,
        // but subscribing without the account block list could let a blocked
        // member's next message reappear directly from Postgres replication.
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
    return subscribeToGroupMessages(groupId, (message) => {
      if (blockedIds.has(message.userId)) return;
      setMessages((current) => mergeMessages(current, [message]));
    });
  }, [blockedIds, blocksReady, enabled, groupId]);

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
        const author = message.author?.displayName || "this member";
        if (
          !window.confirm(
            `Block ${author}? Their community messages will be hidden on this account.`,
          )
        ) {
          return;
        }
        void api
          .blockUser(message.userId)
          .then(() => {
            setBlockedIds((current) => {
              const next = new Set(current);
              next.add(message.userId);
              persistLocalBlockedAuthors(next);
              return next;
            });
          })
          .catch((caught) => {
            setError(
              caught instanceof Error
                ? caught.message
                : "That member could not be blocked.",
            );
          });
      },
    });
  }, [api, enabled, groupId]);

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
  };
}
