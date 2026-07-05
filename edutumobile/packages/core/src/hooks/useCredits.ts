import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status?: string; // present on legacy payment_transactions rows; absent on credit_transactions
  created_at: string;
}

interface UseCreditsReturn {
  credits: number;
  loginStreak: number;
  isLoading: boolean;
  transactions: CreditTransaction[];
  spendCredits: (amount: number, reason: string) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
}

// Profiles are keyed by the raw Clerk ID (written by the Clerk webhook);
// the hashed toSafeUUID form only exists in rows created by older builds.
function lookupIds(userId: string): string[] {
  return Array.from(new Set([userId, toSafeUUID(userId)]));
}

export function useCredits(supabase: SupabaseClient, userId: string | null): UseCreditsReturn {
  const [credits, setCredits] = useState(0);
  const [loginStreak, setLoginStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  const refreshCredits = useCallback(async () => {
    if (!userId) {
      setCredits(0);
      setLoginStreak(0);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const ids = lookupIds(userId);

      // Get credits balance + login streak
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, credits, login_streak')
        .in('user_id', ids);

      const profile =
        profiles?.find((row: { user_id: string }) => row.user_id === userId) ?? profiles?.[0];
      setCredits(profile?.credits || 0);
      setLoginStreak(profile?.login_streak || 0);

      // Get recent transactions. credit_transactions is the canonical credit
      // ledger (all credit RPCs write here); it has no `status` column.
      const { data: txns } = await supabase
        .from('credit_transactions')
        .select('id, type, amount, description, created_at')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .limit(50);

      setTransactions(txns || []);
    } catch (error) {
      console.error('Error loading credits:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userId]);

  const spendCredits = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      // Server-side atomic deduction scoped to the authenticated user.
      const { data, error } = await supabase.rpc('spend_credits', {
        p_amount: amount,
        p_reason: reason,
      });

      if (error) {
        console.error('Error spending credits:', error);
        return false;
      }

      if (data === true) {
        await refreshCredits();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error spending credits:', error);
      return false;
    }
  }, [supabase, userId, refreshCredits]);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  // Live balance/streak updates. Profiles are written server-side (Clerk +
  // RevenueCat webhooks); mirror the realtime pattern used in useProStatus so
  // the balance reflects a credit purchase as soon as the webhook lands.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`credits-status-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
        () => void refreshCredits(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshCredits, supabase, userId]);

  return {
    credits,
    loginStreak,
    isLoading,
    transactions,
    spendCredits,
    refreshCredits,
  };
}
