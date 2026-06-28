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

      // Check Supabase status
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pro, pro_since, pro_expires_at, subscription_id')
        .eq('user_id', toSafeUUID(userId))
        .single();

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

      // Sync if there's a discrepancy
      if (rcPro !== dbPro) {
        await supabase.rpc('sync_subscription_status', {
          p_user_id: toSafeUUID(userId),
          p_is_pro: rcPro,
          p_pro_since: rcPro ? new Date().toISOString() : null,
        });
      }
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
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${toSafeUUID(userId)}` },
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
