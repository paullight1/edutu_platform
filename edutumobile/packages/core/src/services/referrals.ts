/**
 * Referral System
 *
 * Thin client wrappers around the secure server-side referral RPCs
 * (migration 032). Every gate — code allocation, self/duplicate/too-late
 * checks, and the +10/+5 credit grants — is enforced server-side by
 * SECURITY DEFINER functions scoped to `current_app_user_id()`. The client
 * only requests actions and reads its own stats.
 *
 * Flow:
 *  1. Referrer shares `buildReferralLink(code)` (code from getMyReferralCode).
 *  2. Referee opens the link (or types the code) and calls redeemReferral —
 *     recording a PENDING referral.
 *  3. When the referee first completes their profile, the reward settles
 *     automatically inside `award_engagement_credit('PROFILE_COMPLETE')`.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/** Public marketing/App-Link host for shareable invite URLs. */
export const REFERRAL_LINK_HOST = 'https://edutu.org';
/** Custom scheme fallback (works when the app is already installed). */
export const REFERRAL_SCHEME_URL = 'edutu://invite';

export const REFERRAL_REWARD_REFERRER = 10;
export const REFERRAL_REWARD_REFEREE = 5;

/**
 * AsyncStorage key holding a referral code captured before the account
 * exists (from a deep link or the signup field). Redeemed once the user is
 * authenticated, then cleared. Shared by the invite route, the signup
 * screen, and the post-auth redemption effect.
 */
export const PENDING_REFERRAL_KEY = 'pendingReferralCode';

export type RedeemStatus =
  | 'pending'
  | 'invalid_code'
  | 'self'
  | 'already_redeemed'
  | 'too_late'
  | 'error';

export interface ReferralStats {
  total: number;
  completed: number;
  pending: number;
  creditsEarned: number;
}

/**
 * Returns the caller's shareable referral code, generating one on first
 * call. Returns null only if the RPC fails (e.g. the Supabase token was
 * rejected) — callers should treat null as "unavailable", not empty.
 */
export async function getMyReferralCode(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_my_referral_code');
  if (error) {
    console.error('Failed to get referral code:', error);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

/**
 * Records the caller as a referee of `code`'s owner. Returns a status the
 * UI can message on. Never throws — network/RPC failures map to 'error'.
 */
export async function redeemReferral(
  supabase: SupabaseClient,
  code: string,
): Promise<RedeemStatus> {
  const trimmed = code?.trim();
  if (!trimmed) return 'invalid_code';

  const { data, error } = await supabase.rpc('redeem_referral', {
    p_code: trimmed,
  });
  if (error) {
    console.error('Failed to redeem referral:', error);
    return 'error';
  }
  const status = (data as { status?: string } | null)?.status;
  return (status as RedeemStatus) ?? 'error';
}

/** A redeem status that will never change on retry — safe to stop retrying. */
export function isTerminalRedeemStatus(status: RedeemStatus): boolean {
  return status !== 'error';
}

/** Aggregate referral stats for the caller (as a referrer). */
export async function getReferralStats(
  supabase: SupabaseClient,
): Promise<ReferralStats> {
  const empty: ReferralStats = {
    total: 0,
    completed: 0,
    pending: 0,
    creditsEarned: 0,
  };
  const { data, error } = await supabase.rpc('get_my_referral_stats');
  if (error) {
    console.error('Failed to load referral stats:', error);
    return empty;
  }
  const d = data as Partial<ReferralStats> | null;
  return {
    total: Number(d?.total ?? 0),
    completed: Number(d?.completed ?? 0),
    pending: Number(d?.pending ?? 0),
    creditsEarned: Number(d?.creditsEarned ?? 0),
  };
}

/**
 * Builds the shareable universal link that pre-fills the code on signup:
 * `https://edutu.org/invite?code=ABC12345`. On Android/iOS with app links
 * configured this deep-links straight into the app; elsewhere it's a plain
 * pasteable URL.
 */
export function buildReferralLink(code: string): string {
  return `${REFERRAL_LINK_HOST}/invite?code=${encodeURIComponent(code)}`;
}

/** The share sheet body — a short invite plus the link. */
export function buildReferralMessage(code: string): string {
  const link = buildReferralLink(code);
  return (
    `Join me on Edutu — find scholarships, jobs and opportunities, and get an AI coach to help you win them. ` +
    `Use my code ${code} when you sign up and we both earn ${REFERRAL_REWARD_REFERRER} credits. ${link}`
  );
}
