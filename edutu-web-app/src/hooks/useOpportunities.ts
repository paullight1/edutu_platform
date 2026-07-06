import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchOpportunities,
  getCachedOpportunitiesSync,
  subscribeToOpportunities
} from '../services/opportunities';
import type { Opportunity } from '../types/opportunity';

interface UseOpportunitiesState {
  data: Opportunity[];
  loading: boolean;
  error: string | null;
}

export interface UseOpportunitiesResult extends UseOpportunitiesState {
  refresh: () => void;
}

export function useOpportunities(): UseOpportunitiesResult {
  // Seed synchronously from the cache so revisits paint instantly instead of
  // flashing skeletons while the (already cached) data resolves.
  const [{ data, loading, error }, setState] = useState<UseOpportunitiesState>(
    () => {
      const cached = getCachedOpportunitiesSync();
      return {
        data: cached ?? [],
        loading: !cached,
        error: null
      };
    }
  );
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    // Reflect background revalidations (stale-while-revalidate) triggered by
    // any other screen or the boot-time warm-up.
    return subscribeToOpportunities((opportunities) => {
      setState((prev) => {
        if (opportunities.length === 0 && prev.data.length > 0) {
          return prev;
        }
        return {
          data: opportunities,
          loading: false,
          error: prev.error
        };
      });
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    setState((prev) => ({
      ...prev,
      loading: prev.data.length === 0,
      error: refreshIndex === 0 ? null : prev.error
    }));

    fetchOpportunities({ force: refreshIndex > 0 })
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
  }, [refreshIndex]);

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
