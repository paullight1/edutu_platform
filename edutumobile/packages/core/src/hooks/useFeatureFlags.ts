import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeatureFlag, UseFeatureFlagsReturn } from '../types/feature-flags';

let cache: FeatureFlag[] | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export function useFeatureFlags(supabase: SupabaseClient): UseFeatureFlagsReturn {
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    if (cache && Date.now() - cacheTime < CACHE_DURATION) {
      setFeatures(cache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        throw error;
      }

      const flags = (data || []) as FeatureFlag[];
      cache = flags;
      cacheTime = Date.now();
      setFeatures(flags);
    } catch (error) {
      console.error('Error fetching feature flags:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const refresh = useCallback(async () => {
    cache = null;
    cacheTime = 0;
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
