import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
}

interface UseCreditsReturn {
  credits: number;
  isLoading: boolean;
  transactions: CreditTransaction[];
  spendCredits: (amount: number, reason: string) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
}

export function useCredits(supabase: SupabaseClient, userId: string | null): UseCreditsReturn {
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  const refreshCredits = useCallback(async () => {
    if (!userId) {
      setCredits(0);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Get credits balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', toSafeUUID(userId))
        .single();

      setCredits(profile?.credits || 0);

      // Get recent transactions
      const { data: txns } = await supabase
        .from('payment_transactions')
        .select('id, type, amount, description, status, created_at')
        .eq('user_id', toSafeUUID(userId))
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
      const { data } = await supabase.rpc('deduct_credits', {
        user_uuid: toSafeUUID(userId),
        amount,
        reason,
      });

      if (data) {
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

  return {
    credits,
    isLoading,
    transactions,
    spendCredits,
    refreshCredits,
  };
}
