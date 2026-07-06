import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchOpportunities, getCachedOpportunitiesSnapshot } from '../services/opportunities';
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
  const getAuthTokenRef = useRef(getAuthToken);
  const profileOverrideRef = useRef(profileOverride);
  const excludeOpportunityIdsRef = useRef(excludeOpportunityIds);
  const onSyncSnapshotRef = useRef(onSyncSnapshot);
  const onUpdateN8nRef = useRef(onUpdateN8n);
  /** Timestamp of the first time cached data was painted into state. */
  const firstPaintAtRef = useRef<number | null>(null);
  const profileOverrideKey = useMemo(() => getProfileKey(profileOverride), [profileOverride]);
  const excludeOpportunityIdsKey = useMemo(
    () => [...(excludeOpportunityIds ?? [])].sort().join(','),
    [excludeOpportunityIds]
  );

  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);

  useEffect(() => {
    profileOverrideRef.current = profileOverride;
  }, [profileOverride]);

  useEffect(() => {
    excludeOpportunityIdsRef.current = excludeOpportunityIds;
  }, [excludeOpportunityIds]);

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

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refresh
    }),
    [data, error, loading, refresh]
  );
}
