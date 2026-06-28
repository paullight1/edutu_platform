import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchOpportunities, getCachedOpportunitiesSnapshot } from '../services/opportunities';
import { Opportunity } from '../types/opportunity';

interface UseOpportunitiesOptions {
  supabase: SupabaseClient;
  userId?: string;
  getAuthToken?: () => Promise<string | null | undefined>;
  profileOverride?: Record<string, unknown> | null;
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

export function useOpportunities(options: UseOpportunitiesOptions) {
  const { supabase, userId, getAuthToken, profileOverride, onSyncSnapshot, onUpdateN8n } = options;
  const [{ data, loading, error }, setState] = useState<UseOpportunitiesState>({
    data: [],
    loading: true,
    error: null
  });
  const [refreshIndex, setRefreshIndex] = useState(0);
  const getAuthTokenRef = useRef(getAuthToken);
  const profileOverrideRef = useRef(profileOverride);
  const onSyncSnapshotRef = useRef(onSyncSnapshot);
  const onUpdateN8nRef = useRef(onUpdateN8n);
  const profileOverrideKey = useMemo(() => getProfileKey(profileOverride), [profileOverride]);

  useEffect(() => {
    getAuthTokenRef.current = getAuthToken;
  }, [getAuthToken]);

  useEffect(() => {
    profileOverrideRef.current = profileOverride;
  }, [profileOverride]);

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

    fetchOpportunities({ 
      supabase, 
      force: refreshIndex > 0,
      userId,
      getAuthToken: getAuthTokenRef.current,
      profileOverride: profileOverrideRef.current,
      onSyncSnapshot: onSyncSnapshotRef.current,
      onUpdateN8n: onUpdateN8nRef.current
    })
      .then((opportunities) => {
        if (!isActive) {
          return;
        }

        setState({
          data: opportunities,
          loading: false,
          error: null
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
  }, [profileOverrideKey, refreshIndex, supabase, userId]);

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
