import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommunityApi } from "./api";
import { subscribeToGroupMessages } from "./realtime";
import type { CommunityMessage } from "./types";

function mergeMessages(
  current: CommunityMessage[],
  incoming: CommunityMessage[],
): CommunityMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing?.author && !message.author ? { ...message, author: existing.author } : message);
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
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
      setError(caught instanceof Error ? caught.message : "Messages could not be loaded.");
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
    if (!enabled || !groupId) return;
    return subscribeToGroupMessages(groupId, (message) => {
      setMessages((current) => mergeMessages(current, [message]));
    });
  }, [enabled, groupId]);

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
      setError(caught instanceof Error ? caught.message : "Older messages could not be loaded.");
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

  const newestAt = useMemo(() => messages[messages.length - 1]?.createdAt ?? null, [messages]);

  return {
    messages,
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
