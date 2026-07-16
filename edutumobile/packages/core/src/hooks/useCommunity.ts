import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchCommunityStories, getCommunityStory } from '../services/community';
import {
  CommunityStory,
  CommunityStoryQueryOptions,
} from '../types/community';

interface UseCommunityOptions {
  supabase: SupabaseClient;
  queryOptions?: CommunityStoryQueryOptions;
}

interface UseCommunityState {
  data: CommunityStory[];
  loading: boolean;
  error: string | null;
}

export function useCommunity(options: UseCommunityOptions) {
  const { supabase, queryOptions } = options;
  const [{ data, loading, error }, setState] = useState<UseCommunityState>({
    data: [],
    loading: true,
    error: null
  });
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Depend on the serialized query so the effect re-runs only when the query
  // logically changes, with a stable object identity for the fetch call.
  const queryKey = JSON.stringify(queryOptions ?? {});
  const stableQueryOptions = useMemo(
    () => JSON.parse(queryKey) as CommunityStoryQueryOptions,
    [queryKey]
  );

  // Loading starts true (initial state above), so the effect never needs a
  // synchronous setState; manual refresh() flips it back on in the handler.
  useEffect(() => {
    let isActive = true;

    fetchCommunityStories(supabase, stableQueryOptions)
      .then((stories) => {
        if (!isActive) return;

        setState({
          data: stories,
          loading: false,
          error: null
        });
      })
      .catch((err: unknown) => {
        if (!isActive) return;

        const message =
          err instanceof Error ? err.message : 'Unable to load community stories';

        setState((prev) => ({
          ...prev,
          loading: false,
          error: message
        }));
      });

    return () => {
      isActive = false;
    };
  }, [refreshIndex, supabase, stableQueryOptions]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    setRefreshIndex((value) => value + 1);
  }, []);

  const getStory = useCallback(
    async (id: string) => {
      return getCommunityStory(supabase, id);
    },
    [supabase]
  );

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
      getStory
    }),
    [data, error, loading, refresh, getStory]
  );
}