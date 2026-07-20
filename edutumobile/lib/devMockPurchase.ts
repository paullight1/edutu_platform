// DEV-ONLY. Simulates a successful RevenueCat purchase by POSTing the exact
// event a real purchase would to the Supabase webhook, so the server grants Pro
// end-to-end (profiles.is_pro + billing_entitlements + subscriptions) without
// any real payment. Call sites are guarded by __DEV__, so this never runs in a
// release build. The secret is read from an UNCOMMITTED env var
// (EXPO_PUBLIC_RC_WEBHOOK_SECRET_DEV in .env, which is gitignored) — if it isn't
// set, the helper no-ops with a helpful message instead of hitting the webhook.

const WEBHOOK_URL =
  'https://sioxocmrjmdevsdlzjns.supabase.co/functions/v1/revenuecat-webhook';

export async function devMockProPurchase(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.EXPO_PUBLIC_RC_WEBHOOK_SECRET_DEV;
  if (!secret) {
    return {
      ok: false,
      error:
        'Set EXPO_PUBLIC_RC_WEBHOOK_SECRET_DEV in .env (the webhook secret) to use the dev mock purchase.',
    };
  }

  const now = Date.now();
  const body = {
    api_version: '1.0',
    event: {
      type: 'INITIAL_PURCHASE',
      id: `dev-mock-${now}`,
      created_at: new Date(now).toISOString(),
      data: {
        app_user_id: userId,
        product_id: 'monthly',
        transaction_id: `dev-mock-txn-${now}`,
        store: 'APP_STORE',
        price: 6.99,
        currency: 'USD',
        period_type: 'NORMAL',
        is_trial_conversion: false,
        expiration_at_ms: String(now + 31 * 24 * 3600 * 1000),
        environment: 'SANDBOX',
        entitlement_ids: ['pro'],
      },
    },
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: secret },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `Webhook responded ${res.status}` };
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : 'network error' };
  }
}
