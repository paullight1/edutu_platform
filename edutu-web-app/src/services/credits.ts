import { supabase } from "../lib/supabaseClient";
import logger from "../lib/logger";

export type TransactionType =
  | "purchase"
  | "spend"
  | "reward"
  | "refund"
  | "admin_grant"
  | "creator_earning";

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  description: string;
  related_id: string | null;
  related_type: string | null;
  created_at: string;
}

export const CREDIT_TRANSACTION_LABELS: Record<TransactionType, string> = {
  purchase: "Purchase",
  spend: "Spent",
  reward: "Reward",
  refund: "Refund",
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
    .from("credit_transactions")
    .select("*")
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
