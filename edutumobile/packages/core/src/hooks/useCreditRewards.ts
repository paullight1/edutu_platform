import { useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  awardCredits,
  claimDailyLoginCredit,
  EngagementReason,
} from '../services/credits';
import { useCredits } from './useCredits';

/**
 * Human-readable labels passed to `onEarned` so the UI layer can build a toast
 * without hard-coding reason strings. Kept UI-free (no toast/theme deps here).
 */
const REASON_LABELS: Record<EngagementReason, string> = {
  PROFILE_COMPLETE: 'completing your profile',
  REFER_FRIEND: 'referring a friend',
  APPLY_OPPORTUNITY: 'applying',
  COMPLETE_GOAL: 'completing a goal',
  WRITE_REVIEW: 'writing a review',
};

interface UseCreditRewardsOptions {
  /**
   * Fired only when the server actually granted credits (earned > 0). The UI
   * layer wires this to a toast. `label` is a short human descriptor of the
   * reason (e.g. "applying", or a "3-day streak" for the daily claim).
   */
  onEarned?: (amount: number, label: string) => void;
}

interface UseCreditRewardsReturn {
  claimDaily: () => Promise<{ earned: number; streak: number }>;
  award: (reason: EngagementReason) => Promise<number>;
}

/**
 * Thin client wrapper around the secure server-side credit RPCs. All amounts,
 * claim gates, and de-duplication are enforced server-side — this only requests
 * a claim, surfaces the granted amount via `onEarned`, and refreshes the
 * cached balance. Guards against a null user id.
 */
export function useCreditRewards(
  supabase: SupabaseClient,
  userId: string | null,
  options: UseCreditRewardsOptions = {},
): UseCreditRewardsReturn {
  const { onEarned } = options;
  const { refreshCredits } = useCredits(supabase, userId);

  const claimDaily = useCallback(async () => {
    if (!userId) return { earned: 0, streak: 0 };

    const result = await claimDailyLoginCredit(supabase);
    if (result.earned > 0) {
      onEarned?.(result.earned, `${result.streak}-day streak`);
      await refreshCredits();
    }
    return result;
  }, [supabase, userId, onEarned, refreshCredits]);

  const award = useCallback(
    async (reason: EngagementReason) => {
      if (!userId) return 0;

      const earned = await awardCredits(supabase, reason);
      if (earned > 0) {
        onEarned?.(earned, REASON_LABELS[reason]);
        await refreshCredits();
      }
      return earned;
    },
    [supabase, userId, onEarned, refreshCredits],
  );

  return { claimDaily, award };
}
