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

  useEffect(() => {
    let isActive = true;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: refreshIndex === 0 ? null : prev.error
    }));

    fetchCommunityStories(supabase, queryOptions || {})
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
  }, [refreshIndex, supabase, JSON.stringify(queryOptions)]);

  const refresh = useCallback(() => {
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