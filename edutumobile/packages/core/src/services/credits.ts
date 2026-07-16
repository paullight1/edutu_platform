/**
 * Credit Earn System
 *
 * Users earn free credits through platform engagement:
 * - Complete profile: +5 credits (once)
 * - Daily login: +1 credit (once per 24h)
 * - Refer a friend: +10 credits (once)
 * - Apply to opportunity: +3 credits (once per day)
 * - Complete goal: +5 credits (once per day)
 * - Write a review: +2 credits (once per day)
 * - Streak bonus: +2 credits for every 7-day login streak
 *
 * All amounts, claim gates, and streak state are enforced server-side by
 * SECURITY DEFINER functions scoped to auth.uid() (migration 015). The
 * client only requests a claim — it can never assert an amount.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export const CREDIT_REWARDS = {
  PROFILE_COMPLETE: 5,
  DAILY_LOGIN: 1,
  REFER_FRIEND: 10,
  APPLY_OPPORTUNITY: 3,
  COMPLETE_GOAL: 5,
  WRITE_REVIEW: 2,
  STREAK_BONUS: 2,
} as const;

export type EngagementReason = Exclude<keyof typeof CREDIT_REWARDS, 'DAILY_LOGIN' | 'STREAK_BONUS'>;

export async function claimDailyLoginCredit(
  supabase: SupabaseClient,
): Promise<{ earned: number; streak: number }> {
  const { data, error } = await supabase.rpc('claim_daily_credit');

  if (error) {
    console.error('Failed to claim daily login credit:', error);
    return { earned: 0, streak: 0 };
  }

  return {
    earned: Number(data?.earned ?? 0),
    streak: Number(data?.streak ?? 0),
  };
}

export async function awardCredits(
  supabase: SupabaseClient,
  reason: EngagementReason,
): Promise<number> {
  const { data, error } = await supabase.rpc('award_engagement_credit', {
    p_reason: reason,
  });

  if (error) {
    console.error('Failed to award engagement credit:', error);
    return 0;
  }

  return Number(data ?? 0);
}
