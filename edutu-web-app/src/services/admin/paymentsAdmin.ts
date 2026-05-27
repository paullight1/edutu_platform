/**
 * Admin Payments & Credits Service
 * Handles credit transactions, user balances, pro status, and admin grants
 */
import { supabase } from '../../lib/supabaseClient';

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: 'purchase' | 'spend' | 'reward' | 'refund' | 'admin_grant' | 'creator_earning';
  amount: number;
  description: string | null;
  related_id: string | null;
  related_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  credits: number;
  is_pro: boolean;
  pro_expires_at: string | null;
  role: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface TransactionFilters {
  userId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ─── Transactions ───────────────────────────────────────────────

export async function getTransactions(filters: TransactionFilters = {}): Promise<{ data: CreditTransaction[]; count: number }> {
  let query = supabase
    .from('credit_transactions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function getUserTransactions(userId: string): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── User Profiles ──────────────────────────────────────────────

export async function getAllUsers(search?: string): Promise<UserProfile[]> {
  let query = supabase
    .from('profiles')
    .select('user_id, email, full_name, credits, is_pro, pro_expires_at, role, created_at, last_seen_at')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, full_name, credits, is_pro, pro_expires_at, role, created_at, last_seen_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if ('code' in error && error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ─── Admin Actions ──────────────────────────────────────────────

export async function adminGrantCredits(
  userId: string,
  amount: number,
  description: string,
): Promise<{ success: boolean; balance: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_grant_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    p_related_id: null,
    p_related_type: null,
  });

  if (error) {
    console.error('adminGrantCredits RPC error:', error);
    return { success: false, balance: 0, error: error.message };
  }

  const result = data?.[0];
  return {
    success: result?.success ?? false,
    balance: result?.balance ?? 0,
    error: result?.error_message,
  };
}

export async function adminSetProStatus(
  userId: string,
  isPro: boolean,
  expiresAt?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_set_pro_status', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_pro_expires_at: expiresAt ?? null,
  });

  if (error) {
    console.error('adminSetProStatus RPC error:', error);
    return { success: false, error: error.message };
  }

  const result = data?.[0];
  return {
    success: result?.success ?? false,
    error: result?.error_message,
  };
}

// ─── Stats ──────────────────────────────────────────────────────

export async function getPaymentsStats(): Promise<{
  totalRevenue: number;
  totalCreditsSpent: number;
  totalTransactions: number;
  purchaseTransactions: number;
  topSpenders: Array<{ user_id: string; total_spent: number }>;
}> {
  // Total purchase credits
  const { data: purchaseData } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('type', 'purchase');

  // Total spent credits
  const { data: spendData } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('type', 'spend');

  // Total transactions
  const { count: totalCount } = await supabase
    .from('credit_transactions')
    .select('*', { count: 'exact', head: true });

  // Purchase count
  const { count: purchaseCount } = await supabase
    .from('credit_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'purchase');

  const totalRevenue = purchaseData?.reduce((sum, t) => sum + (t.amount || 0), 0) ?? 0;
  const totalCreditsSpent = spendData?.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) ?? 0;

  // Top spenders (simplified - would need a more complex query for production)
  const topSpenders: Array<{ user_id: string; total_spent: number }> = [];

  return {
    totalRevenue,
    totalCreditsSpent,
    totalTransactions: totalCount ?? 0,
    purchaseTransactions: purchaseCount ?? 0,
    topSpenders,
  };
}
