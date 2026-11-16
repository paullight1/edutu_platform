import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReferralLink,
  buildReferralMessage,
  getMyReferralCode,
  getReferralStats,
  ReferralStats,
} from '../services/referrals';

interface UseReferralReturn {
  code: string | null;
  link: string | null;
  message: string | null;
  stats: ReferralStats;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_STATS: ReferralStats = {
  total: 0,
  completed: 0,
  pending: 0,
  creditsEarned: 0,
};

/**
 * Loads the caller's referral code + stats for an invite screen. All state
 * is derived from the secure RPCs; guards a null user id.
 */
export function useReferral(
  supabase: SupabaseClient,
  userId: string | null,
): UseReferralReturn {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);

  // Internal load as a promise chain so every setState lands in an async
  // callback — the mount effect can call it directly without a synchronous
  // setState (React Compiler forbids that). Mirrors useCredits.
  const load = useCallback((): Promise<void> => {
    if (!userId) {
      return Promise.resolve().then(() => {
        setCode(null);
        setStats(EMPTY_STATS);
        setIsLoading(false);
      });
    }
    return Promise.all([getMyReferralCode(supabase), getReferralStats(supabase)])
      .then(([nextCode, nextStats]) => {
        setCode(nextCode);
        setStats(nextStats);
      })
      .catch((err: unknown) => {
        console.error('Failed to load referral data:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [supabase, userId]);

  // Manual refresh (pull-to-refresh) flips the loading flag first. Called from
  // event handlers, never an effect, so the synchronous setState is fine.
  const refresh = useCallback((): Promise<void> => {
    setIsLoading(true);
    return load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    code,
    link: code ? buildReferralLink(code) : null,
    message: code ? buildReferralMessage(code) : null,
    stats,
    isLoading,
    refresh,
  };
}
