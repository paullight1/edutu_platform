import { supabase } from "../lib/supabaseClient";
import logger from "../lib/logger";

// Canonical ledger is `payment_transactions` (what the server functions
// spend_credits/admin_add_credits and the RevenueCat webhook write, and what
// the mobile app reads). `amount` is signed (spends are negative).
export type TransactionType =
  | "subscription_purchase"
  | "credit_purchase"
  | "credit_spend"
  | "reward"
  | "refund"
  | "payout"
  | "credit"
  // legacy credit_transactions types, kept so old rows still render
  | "purchase"
  | "spend"
  | "admin_grant"
  | "creator_earning";

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  description: string;
  status?: string | null;
  currency?: string | null;
  transaction_id?: string | null;
  created_at: string;
}

export const CREDIT_TRANSACTION_LABELS: Record<TransactionType, string> = {
  subscription_purchase: "Subscription",
  credit_purchase: "Credit purchase",
  credit_spend: "Spent",
  reward: "Reward",
  refund: "Refund",
  payout: "Payout",
  credit: "Credit",
  // legacy
  purchase: "Purchase",
  spend: "Spent",
  admin_grant: "Granted by admin",
  creator_earning: "Creator earning",
};

export function formatCreditTransactionType(type: string): string {
  if (type in CREDIT_TRANSACTION_LABELS) {
    return CREDIT_TRANSACTION_LABELS[type as TransactionType];
  }

  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .select("credits")
    .eq("user_id", userId)
    .single();

  if (error) {
    logger.error("Error fetching credit balance:", error);
    return 0;
  }

  return data?.credits ?? 0;
}

export async function getTransactionHistory(
  userId: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("id, user_id, type, amount, description, status, currency, transaction_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("Error fetching transaction history:", error);
    return [];
  }

  return data || [];
}

export async function spendCredits(
  amount: number,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  // Atomic deduction scoped to the authenticated user (auth.uid()) — the
  // user id is NEVER passed from the client. See migration 015. The RPC
  // returns a boolean (true = spent, false = insufficient balance).
  const { data, error } = await supabase.rpc("spend_credits", {
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    logger.error("spendCredits RPC error:", error);
    return { success: false, error: error.message };
  }

  return data === true
    ? { success: true }
    : { success: false, error: "Insufficient credits" };
}

// NOTE: client-side `addCredits` was removed. Credits can only be *earned*
// server-side (award_engagement_credit / claim_daily_credit) or granted by
// the service role (admin_add_credits) — a client can never mint credits.

export async function hasEnoughCredits(
  userId: string,
  amount: number,
): Promise<{ enough: boolean; balance: number }> {
  const balance = await getCreditBalance(userId);
  return { enough: balance >= amount, balance };
}
