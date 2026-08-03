import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';
import { initRevenueCat, isProSubscriber } from '../services/payments';

interface UseProStatusReturn {
  isPro: boolean;
  isLoading: boolean;
  proSince: string | null;
  subscriptionId: string | null;
  refreshStatus: () => Promise<void>;
}

export function useProStatus(supabase: SupabaseClient, userId: string | null): UseProStatusReturn {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [proSince, setProSince] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  // Clear Pro state the moment the user signs out — adjust-during-render
  // (React's documented alternative to a state-resetting effect).
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) setIsPro(false);
  }

  // Internal fetch as an explicit promise chain: all state updates happen in
  // async callbacks, so the mount effect can call this without a synchronous
  // setState. The public checkStatus below keeps the loading flip for
  // manual/realtime refresh callers.
  const fetchStatus = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();

    // Initialize RevenueCat
    return initRevenueCat(userId)
      .then(async () => {
        // Check RevenueCat subscription status
        const rcPro = await isProSubscriber();

        // Check Supabase status. Profiles are keyed by the raw Clerk ID;
        // the hashed toSafeUUID form only exists in rows from older builds.
        const lookupIds = Array.from(new Set([userId, toSafeUUID(userId)]));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, is_pro, pro_since, pro_expires_at, subscription_id')
          .in('user_id', lookupIds);

        const profile =
          profiles?.find((row: { user_id: string }) => row.user_id === userId) ?? profiles?.[0];

        const profileExpiresAt = profile?.pro_expires_at ? new Date(profile.pro_expires_at).getTime() : null;
        const profileMirrorPro = Boolean(profile?.is_pro) && (!profileExpiresAt || profileExpiresAt > Date.now());

        // Fetch every 'pro' row regardless of status — NOT just the active ones.
        // Filtering on status server-side made a cancelled/expired row look
        // identical to "this user has no entitlement record at all", which is
        // the one case where we still fall back to the profiles mirror. Seeing
        // the inactive row is what lets us say "authoritatively NOT Pro".
        const { data: entitlements, error: entitlementsError } = await supabase
          .from('billing_entitlements')
          .select('feature_key, status, expires_at')
          .eq('user_id', userId)
          .eq('feature_key', 'pro');

        const proEntitlements = (entitlements || []).filter(
          (entitlement: any) => entitlement.feature_key === 'pro',
        );

        const entitlementPro = proEntitlements.some((entitlement: any) => {
          const expiresAt = entitlement.expires_at ? new Date(entitlement.expires_at).getTime() : null;
          return entitlement.status === 'active' && (!expiresAt || expiresAt > Date.now());
        });

        // ── Entitlement authority ────────────────────────────────────────────
        // Two authorities, never OR'd together with the mirror:
        //   • RevenueCat owns the store path (iOS/Android IAP). Its SDK only
        //     ever reports entitlements the store still considers active, so a
        //     `true` here is definitive — no local expiry check to redo.
        //   • billing_entitlements owns the web/Paystack + legacy-webhook path
        //     and is the single source of truth on the server. When the query
        //     succeeds and returns rows, its verdict is FINAL in both
        //     directions: an expired/absent-but-present row means NOT Pro, even
        //     if profiles.is_pro is still true. That is the bug this replaces —
        //     OR-ing the mirror in kept lapsed users Pro forever whenever the
        //     mirror write failed or was never expired.
        //
        // profiles.is_pro / pro_expires_at are a best-effort MIRROR and can
        // only ever be consulted as a FALLBACK when we have no entitlement
        // data at all, never as an independent grant:
        //   • query failed (offline / RLS / transport) → trust the last known
        //     mirror rather than downgrading a paying user on a network blip.
        //   • query succeeded but the user has NO 'pro' row of any status →
        //     this is either a legacy grant written before billing_entitlements
        //     existed, or a failed webhook write. We only honour it when the
        //     mirror carries an explicit, unexpired pro_expires_at (a real,
        //     bounded grant). An is_pro=true row with NO expiry and NO
        //     entitlement row is exactly the never-expiring ghost we are
        //     killing, so it does not count.
        const hasEntitlementData = !entitlementsError && proEntitlements.length > 0;
        const mirrorFallbackPro = entitlementsError
          ? profileMirrorPro
          : profileMirrorPro && profileExpiresAt !== null;

        const actualPro = rcPro || (hasEntitlementData ? entitlementPro : mirrorFallbackPro);

        setIsPro(actualPro);
        setProSince(profile?.pro_since || null);
        setSubscriptionId(profile?.subscription_id || null);

        // Note: profiles.is_pro and billing_entitlements are written only by
        // server-side webhooks (RevenueCat / Paystack, service role). This hook
        // stays read-only — the client must never sync or repair entitlement
        // state, not even to "fix" a stale mirror it just detected here; that
        // would let a patched client self-grant Pro.
      })
      .catch((error: unknown) => {
        console.error('Error checking pro status:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [supabase, userId]);

  const checkStatus = useCallback(async () => {
    if (!userId) {
      setIsPro(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    return fetchStatus();
  }, [userId, fetchStatus]);

  // Reach the latest checkStatus from the realtime handler without making it a
  // subscription dependency; re-subscribing on a reused topic is what triggers
  // Supabase's "cannot add postgres_changes callbacks after subscribe" crash.
  const checkStatusRef = useRef(checkStatus);
  useEffect(() => {
    checkStatusRef.current = checkStatus;
  }, [checkStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!userId) return;

    // Guard against a stale channel of the same topic left joined after a fast
    // remount, and never let a realtime binding error reach the ErrorBoundary.
    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    try {
      for (const existing of supabase.getChannels()) {
        if (existing.topic === `realtime:billing-status-${userId}`) {
          void supabase.removeChannel(existing);
        }
      }

      channel = supabase
        .channel(`billing-status-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'billing_entitlements', filter: `user_id=eq.${userId}` },
          () => void checkStatusRef.current(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
          () => void checkStatusRef.current(),
        )
        .subscribe();
    } catch (error) {
      console.warn('Billing realtime subscription failed:', error);
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return {
    isPro,
    // Never report "loading" while signed out — the mount effect only fetches
    // when a user is present.
    isLoading: userId ? isLoading : false,
    proSince,
    subscriptionId,
    refreshStatus: checkStatus,
  };
}
