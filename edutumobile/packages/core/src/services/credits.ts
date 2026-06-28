/**
 * Credit Earn System
 *
 * Users earn free credits through platform engagement:
 * - Complete profile: +5 credits
 * - Daily login: +1 credit (once per 24h)
 * - Refer a friend: +10 credits
 * - Apply to opportunity: +3 credits
 * - Complete goal: +5 credits
 * - Write a review: +2 credits
 * - Streak bonus: +2 credits for 7-day streak
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient } from '@supabase/supabase-js';

const LAST_LOGIN_KEY = 'edutu_last_login_credit';
const STREAK_KEY = 'edutu_login_streak';

export const CREDIT_REWARDS = {
  PROFILE_COMPLETE: 5,
  DAILY_LOGIN: 1,
  REFER_FRIEND: 10,
  APPLY_OPPORTUNITY: 3,
  COMPLETE_GOAL: 5,
  WRITE_REVIEW: 2,
  STREAK_BONUS: 2,
} as const;

interface CreditTransaction {
  userId: string;
  amount: number;
  reason: string;
  timestamp: string;
}

export async function claimDailyLoginCredit(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ earned: number; streak: number }> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Check last claim
  const lastClaim = await AsyncStorage.getItem(LAST_LOGIN_KEY);
  if (lastClaim) {
    const elapsed = now - parseInt(lastClaim, 10);
    if (elapsed < DAY_MS) {
      return { earned: 0, streak: await getStreak() };
    }
  }

  // Update streak
  const streakData = await AsyncStorage.getItem(STREAK_KEY);
  let streak = streakData ? JSON.parse(streakData) : { count: 0, lastDate: '' };
  const today = new Date().toISOString().slice(0, 10);

  if (streak.lastDate === today) {
    // Already counted today
  } else if (streak.lastDate === new Date(now - DAY_MS).toISOString().slice(0, 10)) {
    streak.count++;
  } else {
    streak.count = 1;
  }

  streak.lastDate = today;
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  await AsyncStorage.setItem(LAST_LOGIN_KEY, String(now));

  const streakBonus = streak.count > 0 && streak.count % 7 === 0 ? CREDIT_REWARDS.STREAK_BONUS : 0;
  const earned = CREDIT_REWARDS.DAILY_LOGIN + streakBonus;

  // Record transaction in Supabase
  try {
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: earned,
      type: 'earn',
      reason: streakBonus ? `Daily login + ${streak.count}-day streak bonus` : 'Daily login',
    });
  } catch (e) {
    console.error('Failed to record credit transaction:', e);
  }

  return { earned, streak: streak.count };
}

async function getStreak(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(STREAK_KEY);
    return data ? JSON.parse(data).count : 0;
  } catch {
    return 0;
  }
}

export async function awardCredits(
  supabase: SupabaseClient,
  userId: string,
  reason: keyof typeof CREDIT_REWARDS,
): Promise<boolean> {
  const amount = CREDIT_REWARDS[reason];
  try {
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount,
      type: 'earn',
      reason,
    });
    return true;
  } catch {
    return false;
  }
}
