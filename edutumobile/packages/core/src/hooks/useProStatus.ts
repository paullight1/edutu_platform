import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';
import { getActiveEntitlements, initRevenueCat, isProSubscriber } from '../services/payments';

export type SubscriptionTier = 'none' | 'lite' | 'pro' | 'scholar';

interface UseProStatusReturn {
  isPro: boolean;
  planTier: SubscriptionTier;
  isLoading: boolean;
  proSince: string | null;
  subscriptionId: string | null;
  refreshStatus: () => Promise<void>;
  /** Checks only server-written billing projections; used after a purchase. */
  refreshServerStatus: () => Promise<boolean>;
}

type ServerProStatus = {
  displayPro: boolean;
  displayTier: SubscriptionTier;
  confirmedPro: boolean;
  proSince: string | null;
  subscriptionId: string | null;
};

async function readServerProStatus(supabase: SupabaseClient, userId: string): Promise<ServerProStatus> {
  // Profiles are keyed by the raw Clerk ID; the safe UUID supports legacy rows
  // only and never changes which signed-in user is queried.
  const lookupIds = Array.from(new Set([userId, toSafeUUID(userId)]));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, is_pro, pro_since, pro_expires_at, subscription_id')
    .in('user_id', lookupIds);

  const profile =
    profiles?.find((row: { user_id: string }) => row.user_id === userId) ?? profiles?.[0];
  const profileExpiresAt = profile?.pro_expires_at ? new Date(profile.pro_expires_at).getTime() : null;
  const profileMirrorPro = Boolean(profile?.is_pro) && (!profileExpiresAt || profileExpiresAt > Date.now());

  const { data: entitlements, error: entitlementsError } = await supabase
    .from('billing_entitlements')
    .select('feature_key, status, expires_at')
    .in('user_id', lookupIds)
    .in('feature_key', ['lite', 'pro', 'scholar']);

  const paidEntitlements = (entitlements || []).filter(
    (entitlement: any) => ['lite', 'pro', 'scholar'].includes(entitlement.feature_key),
  );
  const isActivePaidEntitlement = (entitlement: any) => {
    const expiresAt = entitlement.expires_at ? new Date(entitlement.expires_at).getTime() : null;
    return entitlement.status === 'active' && (!expiresAt || expiresAt > Date.now());
  };
  const paidEntitlement = paidEntitlements.some(isActivePaidEntitlement);
  const activePaidEntitlements = paidEntitlements.filter(isActivePaidEntitlement);

  // A completion screen needs proof that the webhook fulfilled the purchase,
  // so only a live canonical entitlement can turn it into a success. The
  // compatibility profile remains available for normal legacy status display.
  const hasEntitlementData = !entitlementsError && paidEntitlements.length > 0;
  const mirrorFallbackPro = entitlementsError
    ? profileMirrorPro
    : profileMirrorPro && profileExpiresAt !== null;

  return {
    displayPro: hasEntitlementData ? paidEntitlement : mirrorFallbackPro,
    displayTier: activePaidEntitlements.some((entitlement: any) => entitlement.feature_key === 'scholar')
      ? 'scholar'
      : activePaidEntitlements.some((entitlement: any) => entitlement.feature_key === 'pro') || mirrorFallbackPro
        ? 'pro'
        : activePaidEntitlements.some((entitlement: any) => entitlement.feature_key === 'lite')
          ? 'lite'
          : 'none',
    confirmedPro: !entitlementsError && paidEntitlement,
    proSince: profile?.pro_since || null,
    subscriptionId: profile?.subscription_id || null,
  };
}

export function useProStatus(supabase: SupabaseClient, userId: string | null): UseProStatusReturn {
  const [isPro, setIsPro] = useState(false);
  const [planTier, setPlanTier] = useState<SubscriptionTier>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [proSince, setProSince] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  // Clear Pro state the moment the user signs out — adjust-during-render
  // (React's documented alternative to a state-resetting effect).
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setIsPro(false);
      setPlanTier('none');
    }
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
        const rcEntitlements = await getActiveEntitlements();

        const serverStatus = await readServerProStatus(supabase, userId);
        const rcTier: SubscriptionTier = rcEntitlements.includes('scholar')
          ? 'scholar'
          : rcEntitlements.includes('pro')
            ? 'pro'
            : rcEntitlements.includes('lite')
              ? 'lite'
              : 'none';
        const actualPro = rcPro || rcTier !== 'none' || serverStatus.displayPro;
        const actualTier: SubscriptionTier = serverStatus.displayTier !== 'none'
          ? serverStatus.displayTier
          : rcTier !== 'none'
            ? rcTier
            : actualPro
              ? 'pro'
              : 'none';

        setIsPro(actualPro);
        setPlanTier(actualTier);
        setProSince(serverStatus.proSince);
        setSubscriptionId(serverStatus.subscriptionId);

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
      setPlanTier('none');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    return fetchStatus();
  }, [userId, fetchStatus]);

  const refreshServerStatus = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    setIsLoading(true);
    try {
      const serverStatus = await readServerProStatus(supabase, userId);
      if (serverStatus.confirmedPro) {
        setIsPro(true);
        setPlanTier(serverStatus.displayTier);
        setProSince(serverStatus.proSince);
        setSubscriptionId(serverStatus.subscriptionId);
      }
      return serverStatus.confirmedPro;
    } catch (error) {
      console.error('Error checking server pro status:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userId]);

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
    planTier,
    // Never report "loading" while signed out — the mount effect only fetches
    // when a user is present.
    isLoading: userId ? isLoading : false,
    proSince,
    subscriptionId,
    refreshStatus: checkStatus,
    refreshServerStatus,
  };
}
