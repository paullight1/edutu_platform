import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeatureFlag, UseFeatureFlagsReturn } from '../types/feature-flags';

let cache: FeatureFlag[] | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000;

function readCachedFlags(): FeatureFlag[] | null {
  return cache && Date.now() - cacheTime < CACHE_DURATION ? cache : null;
}

export function useFeatureFlags(supabase: SupabaseClient): UseFeatureFlagsReturn {
  // Hydrate from the module cache in the lazy initializers so the fetch
  // effect never needs a synchronous setState for the cache-hit path.
  const [features, setFeatures] = useState<FeatureFlag[]>(() => readCachedFlags() ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(() => readCachedFlags() === null);

  // Explicit promise chain (not async/await) so every state update visibly
  // happens in an async callback — safe to call from the mount effect.
  const fetchFlags = useCallback((): Promise<void> => {
    if (readCachedFlags()) return Promise.resolve();

    return Promise.resolve(
      supabase
        .from('feature_flags')
        .select('*')
        .order('sort_order', { ascending: true }),
    )
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }
        const flags = (data || []) as FeatureFlag[];
        cache = flags;
        cacheTime = Date.now();
        setFeatures(flags);
      })
      .catch((error: unknown) => {
        console.error('Error fetching feature flags:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [supabase]);

  const refresh = useCallback(async () => {
    cache = null;
    cacheTime = 0;
    // Manual refresh keeps the loading flip here (event-handler context).
    setIsLoading(true);
    await fetchFlags();
  }, [fetchFlags]);

  const isFeatureEnabled = useCallback((key: string): boolean => {
    const flag = features.find((f) => f.key === key);
    return flag?.is_enabled ?? false;
  }, [features]);

  const isProRequired = useCallback((key: string): boolean => {
    const flag = features.find((f) => f.key === key);
    return flag?.pro_required ?? false;
  }, [features]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  return {
    features,
    isLoading,
    isFeatureEnabled,
    isProRequired,
    refresh,
  };
}
