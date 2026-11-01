import type { SupabaseClient } from '@supabase/supabase-js';
import { toSafeUUID } from '../utils/auth';

export type PaidTier = 'lite' | 'pro' | 'scholar';
type Entitlement = { status: string; expires_at: string | null };

function active(row: Entitlement | null): boolean {
  return row?.status === 'active' &&
    (row.expires_at === null || Date.parse(row.expires_at) > Date.now());
}

/** Restoration may legitimately return an entitlement already active on the server. */
export async function hasRestoredServerEntitlement(
  supabase: SupabaseClient,
  userId: string,
  restoredEntitlements: string[],
): Promise<boolean> {
  let matchedTier = false;
  for (const tier of ['lite', 'pro', 'scholar'] as const) {
    if (!restoredEntitlements.includes(tier)) continue;
    matchedTier = true;
    let activeForTier = false;
    for (const id of new Set([userId, toSafeUUID(userId)])) {
      const { data, error } = await supabase.from('billing_entitlements')
        .select('status, expires_at')
        .eq('user_id', id)
        .eq('feature_key', tier)
        .maybeSingle();
      if (error) throw error;
      if (active(data)) { activeForTier = true; break; }
    }
    if (!activeForTier) return false;
  }
  return matchedTier;
}

/** Capture BEFORE checkout: an existing subscription is not a new purchase.
 * Only the selected tier becoming active or its validity extending confirms
 * fulfillment. A projection timestamp refresh alone is deliberately ignored.
 */
export async function createPurchaseFulfillmentCheck(
  supabase: SupabaseClient,
  userId: string,
  tier: PaidTier,
): Promise<() => Promise<boolean>> {
  const read = async (): Promise<Entitlement | null> => {
    const { data, error } = await supabase.from('billing_entitlements')
      .select('status, expires_at')
      .eq('user_id', userId)
      .eq('feature_key', tier)
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  const before = await read();
  const wasActive = active(before);
  const previousExpiry = before?.expires_at;
  return async () => {
    const after = await read();
    if (!after || !active(after)) return false;
    if (!wasActive) return true;
    if (previousExpiry == null) return false;
    return after.expires_at === null ||
      Date.parse(after.expires_at) > Date.parse(previousExpiry);
  };
}
