import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';
import { initRevenueCat, isProSubscriber, getCustomerInfo } from '../services/payments';

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

  const checkStatus = useCallback(async () => {
    if (!userId) {
      setIsPro(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Initialize RevenueCat
      await initRevenueCat(userId);

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
      const dbPro = Boolean(profile?.is_pro) && (!profileExpiresAt || profileExpiresAt > Date.now());

      const { data: entitlements } = await supabase
        .from('billing_entitlements')
        .select('feature_key, status, expires_at')
        .eq('user_id', userId)
        .eq('status', 'active');

      const entitlementPro = (entitlements || []).some((entitlement: any) => {
        const expiresAt = entitlement.expires_at ? new Date(entitlement.expires_at).getTime() : null;
        return entitlement.feature_key === 'pro' && (!expiresAt || expiresAt > Date.now());
      });

      // Use the most authoritative source (RevenueCat)
      const actualPro = rcPro || dbPro || entitlementPro;
      
      setIsPro(actualPro);
      setProSince(profile?.pro_since || null);
      setSubscriptionId(profile?.subscription_id || null);

      // Note: profiles.is_pro is written only by the RevenueCat webhook
      // (service role). The client must never sync entitlement state —
      // that would let a patched client self-grant Pro.
    } catch (error) {
      console.error('Error checking pro status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`billing-status-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_entitlements', filter: `user_id=eq.${userId}` },
        () => void checkStatus(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
        () => void checkStatus(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [checkStatus, supabase, userId]);

  return {
    isPro,
    isLoading,
    proSince,
    subscriptionId,
    refreshStatus: checkStatus,
  };
}
