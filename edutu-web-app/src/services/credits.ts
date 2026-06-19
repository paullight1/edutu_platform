import { supabase } from "../lib/supabaseClient";

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
    console.error("Error fetching credit balance:", error);
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
    console.error("Error fetching transaction history:", error);
    return [];
  }

  return data || [];
}

export async function spendCredits(
  userId: string,
  amount: number,
  description: string,
  relatedId?: string,
  relatedType?: string,
): Promise<{ success: boolean; balance: number; error?: string }> {
  const { data, error } = await supabase.rpc("spend_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    p_related_id: relatedId ?? null,
    p_related_type: relatedType ?? null,
  });

  if (error) {
    console.error("spendCredits RPC error:", error);
    return { success: false, balance: 0, error: error.message };
  }

  const result = data?.[0];
  return {
    success: result?.success ?? false,
    balance: result?.balance ?? 0,
    error: result?.error_message,
  };
}

export async function addCredits(
  userId: string,
  amount: number,
  description: string,
  relatedId?: string,
  relatedType?: string,
): Promise<{ success: boolean; balance: number }> {
  const { data, error } = await supabase.rpc("add_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    p_related_id: relatedId ?? null,
    p_related_type: relatedType ?? null,
  });

  if (error) {
    console.error("addCredits RPC error:", error);
    return { success: false, balance: 0 };
  }

  const result = data?.[0];
  return {
    success: result?.success ?? false,
    balance: result?.balance ?? 0,
  };
}

export async function hasEnoughCredits(
  userId: string,
  amount: number,
): Promise<{ enough: boolean; balance: number }> {
  const balance = await getCreditBalance(userId);
  return { enough: balance >= amount, balance };
}
