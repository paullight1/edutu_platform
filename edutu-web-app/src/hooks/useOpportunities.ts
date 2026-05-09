import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOpportunities } from '../services/opportunities';
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
  const [{ data, loading, error }, setState] = useState<UseOpportunitiesState>({
    data: [],
    loading: true,
    error: null
  });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let isActive = true;

    setState((prev) => ({
      ...prev,
      loading: true,
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
