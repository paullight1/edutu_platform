import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchOpportunities, getCachedOpportunitiesSnapshot } from '../services/opportunities';
import { getDismissedOpportunityIds } from '../services/dismissedOpportunities';
import { Opportunity } from '../types/opportunity';
import { anchorFeedOrder } from '../utils/feedAnchor';

interface UseOpportunitiesOptions {
  supabase: SupabaseClient;
  userId?: string;
  getAuthToken?: () => Promise<string | null | undefined>;
  profileOverride?: Record<string, unknown> | null;
  excludeOpportunityIds?: string[];
  onSyncSnapshot?: (opportunities: Opportunity[]) => Promise<void>;
  onUpdateN8n?: (opportunities: Opportunity[], userId: string) => Promise<void>;
}

interface UseOpportunitiesState {
  data: Opportunity[];
  loading: boolean;
  error: string | null;
}

function hasSameOpportunitySnapshot(a: Opportunity[], b: Opportunity[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((item, index) => item.id === b[index]?.id);
}

function getProfileKey(profileOverride?: Record<string, unknown> | null) {
  try {
    return JSON.stringify(profileOverride ?? null);
  } catch {
    return 'unserializable-profile';
  }
}

/**
 * Anchoring window: background revalidates that land after this many ms of the
 * user seeing cached data merge via anchorFeedOrder instead of reshuffling.
 */
const FEED_ANCHOR_WINDOW_MS = 2500;

export function useOpportunities(options: UseOpportunitiesOptions) {
  const { supabase, userId, getAuthToken, profileOverride, excludeOpportunityIds, onSyncSnapshot, onUpdateN8n } = options;
  const [{ data, loading, error }, setState] = useState<UseOpportunitiesState>({
    data: [],
    loading: true,
    error: null
  });
  const [refreshIndex, setRefreshIndex] = useState(0);
  /** Locally-dismissed opportunity ids, hydrated from storage per userId. */
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const getAuthTokenRef = useRef(getAuthToken);
  const profileOverrideRef = useRef(profileOverride);
  const onSyncSnapshotRef = useRef(onSyncSnapshot);
  const onUpdateN8nRef = useRef(onUpdateN8n);
  /** Timestamp of the first time cached data was painted into state. */
  const firstPaintAtRef = useRef<number | null>(null);
  const profileOverrideKey = useMemo(() => getProfileKey(profileOverride), [profileOverride]);
  // Merge caller-supplied exclusions with the user's stored dismissals so
  // dismissed opportunities drop out of the feed. De-duped + sorted so the
  // effect key stays stable regardless of source ordering. Capped at 200 —
  // the server DTO rejects longer lists (and it already excludes dismissed
  // items on its own from the dismiss signals; this list mainly serves the
  // offline/local path and cache-staleness windows).
  const mergedExcludeOpportunityIds = useMemo(
    () =>
      Array.from(new Set([...(excludeOpportunityIds ?? []), ...dismissedIds.slice(-150)]))
        .sort()
        .slice(0, 200),
    [excludeOpportunityIds, dismissedIds]
  );
  const excludeOpportunityIdsRef = useRef(mergedExcludeOpportunityIds);
  const excludeOpportunityIdsKey = useMemo(
    () => mergedExcludeOpportunityIds.join(','),
    [mergedExcludeOpportunityIds]
  );

  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);

  useEffect(() => {
    profileOverrideRef.current = profileOverride;
  }, [profileOverride]);

  useEffect(() => {
    excludeOpportunityIdsRef.current = mergedExcludeOpportunityIds;
  }, [mergedExcludeOpportunityIds]);

  // Hydrate the user's stored dismissals so they actually shape the feed
  // (this state previously never left []).
  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setDismissedIds([]);
      return () => {
        isActive = false;
      };
    }

    void getDismissedOpportunityIds(userId).then((ids) => {
      if (isActive) {
        setDismissedIds(ids);
      }
    });

    return () => {
      isActive = false;
    };
  }, [userId]);

  useEffect(() => {
    onSyncSnapshotRef.current = onSyncSnapshot;
  }, [onSyncSnapshot]);

  useEffect(() => {
    onUpdateN8nRef.current = onUpdateN8n;
  }, [onUpdateN8n]);

  useEffect(() => {
    let isActive = true;

    void getCachedOpportunitiesSnapshot(userId).then((cached) => {
      if (!isActive || cached.length === 0) {
        return;
      }

      if (firstPaintAtRef.current === null) {
        firstPaintAtRef.current = Date.now();
      }

      setState((prev) => {
        if (hasSameOpportunitySnapshot(prev.data, cached) && prev.loading) {
          return {
            ...prev,
            loading: false,
          };
        }

        return {
          ...prev,
          data: cached,
          loading: false,
        };
      });
    });

    setState((prev) => {
      const nextError = refreshIndex === 0 ? null : prev.error;
      if (prev.data.length > 0 && refreshIndex === 0) {
        return {
          ...prev,
          error: nextError,
        };
      }

      if (prev.loading && prev.error === nextError) {
        return prev;
      }

      return {
        ...prev,
        loading: true,
        error: nextError
      };
    });

    // Pull-to-refresh drives refreshIndex, which is the same signal we forward
    // to fetchOpportunities as `force`. Forced refreshes always adopt the
    // server order verbatim; only background revalidates get anchored.
    const isForceRefresh = refreshIndex > 0;

    fetchOpportunities({
      supabase,
      force: isForceRefresh,
      userId,
      getAuthToken: getAuthTokenRef.current,
      profileOverride: profileOverrideRef.current,
      excludeOpportunityIds: excludeOpportunityIdsRef.current,
      onSyncSnapshot: onSyncSnapshotRef.current,
      onUpdateN8n: onUpdateN8nRef.current
    })
      .then((opportunities) => {
        if (!isActive) {
          return;
        }

        setState((prev) => {
          const firstPaintAt = firstPaintAtRef.current;
          const cachedWasRendered = firstPaintAt !== null && prev.data.length > 0;
          const shouldAnchor =
            !isForceRefresh &&
            cachedWasRendered &&
            Date.now() - (firstPaintAt as number) > FEED_ANCHOR_WINDOW_MS;

          return {
            data: shouldAnchor
              ? anchorFeedOrder(prev.data, opportunities, (o) => o.id)
              : opportunities,
            loading: false,
            error: null
          };
        });
      })
      .catch((err: unknown) => {
        if (!isActive) {
          return;
        }

        const message =
          err instanceof Error ? err.message : 'Unable to load opportunities';

        setState((prev) => ({
          ...prev,
          loading: false,
          error: message
        }));
      });

    return () => {
      isActive = false;
    };
  }, [excludeOpportunityIdsKey, profileOverrideKey, refreshIndex, supabase, userId]);

  const refresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  /**
   * Instant local removal after a dismissal: updates state (and therefore the
   * filtered feed below) without waiting for storage hydration or a refetch.
   * Call this right after dismissOpportunity().
   */
  const noteDismissed = useCallback((opportunityId: string) => {
    if (!opportunityId) return;
    setDismissedIds((prev) =>
      prev.includes(opportunityId) ? prev : [...prev, opportunityId]
    );
  }, []);

  // Dismissed items never render, even from cached snapshots written before
  // the dismissal — the exclusion list only shapes fetches, not the cache.
  const visibleData = useMemo(() => {
    if (dismissedIds.length === 0) return data;
    const dismissed = new Set(dismissedIds);
    return data.filter((opportunity) => !dismissed.has(opportunity.id));
  }, [data, dismissedIds]);

  return useMemo(
    () => ({
      data: visibleData,
      loading,
      error,
      refresh,
      noteDismissed
    }),
    [visibleData, error, loading, refresh, noteDismissed]
  );
}
