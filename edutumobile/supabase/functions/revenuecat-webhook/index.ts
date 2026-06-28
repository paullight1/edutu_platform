// supabase/functions/revenuecat-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// RevenueCat webhook event types
type RevenueCatEvent = {
  api_version: string;
  event: {
    type: string;
    id: string;
    created_at: string;
    data: {
      app_user_id: string;
      product_id: string;
      transaction_id: string;
      store: string;
      purchase_token?: string;
      price: number;
      currency: string;
      period_type: string;
      is_trial_conversion: boolean;
      expiration_at_ms: string;
      environment: string;
      entitlement_id?: string;
      entitlement_ids?: string[];
      presented_offering_id?: string;
    };
  };
};

serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: SECURITY_HEADERS,
      });
    }

    const signatureHeader = req.headers.get('X-RC-Webhook-Signature');
    if (!signatureHeader) {
      return new Response(JSON.stringify({ error: 'Missing signature header' }), {
        status: 401,
        headers: SECURITY_HEADERS,
      });
    }

    const rawBody = await req.text();

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (signatureHeader.toLowerCase() !== expectedSignature.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: SECURITY_HEADERS,
      });
    }

    const event: RevenueCatEvent = JSON.parse(rawBody);

    const { event: eventData } = event;
    const { data } = eventData;
    const userId = data.app_user_id;

    console.log('Received RevenueCat webhook event:', eventData.type, 'for user:', userId);

    // Map RevenueCat event types to our actions
    switch (eventData.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
        await handleSubscriptionActive(userId, data, eventData.type);
        break;

      case 'CANCELLATION':
        await handleSubscriptionCancelled(userId, data);
        break;

      case 'EXPIRATION':
        await handleSubscriptionExpired(userId, data);
        break;

      case 'NON_RENEWING_PURCHASE':
        // Handle one-time purchases (e.g., credit packages)
        await handleOneTimePurchase(userId, data);
        break;

      default:
        if (__DEV__) {
          console.log(`Unhandled event type: ${eventData.type}`);
        }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: SECURITY_HEADERS,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: SECURITY_HEADERS,
    });
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleSubscriptionActive(
  userId: string,
  data: RevenueCatEvent['event']['data'],
  type: string
) {
  const isPro = data.entitlement_ids?.includes('pro') || data.entitlement_id === 'pro';
  const expiresAt = data.expiration_at_ms ? new Date(parseInt(data.expiration_at_ms)) : null;
  const isTrial = data.is_trial_conversion || data.period_type === 'trial';

  if (__DEV__) {
    console.log(`Subscription active for user ${userId}, isPro: ${isPro}, type: ${type}`);
  }

  // Sync subscription status to profiles
  await supabaseAdmin.rpc('sync_subscription_status', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_pro_since: new Date().toISOString(),
    p_subscription_id: data.transaction_id,
  });

  // Upsert subscription record
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      revenuecat_id: data.transaction_id,
      product_id: data.product_id,
      store: data.store,
      status: 'active',
      expires_at: expiresAt?.toISOString(),
      is_trial_period: isTrial,
      auto_renewing: type === 'RENEWAL',
      will_renew: true,
      environment: data.environment,
      original_transaction_id: data.transaction_id,
      latest_transaction_id: data.transaction_id,
      raw_data: data,
    }, {
      onConflict: 'revenuecat_id',
    });

  if (subError) {
    console.error('Error upserting subscription:', subError);
  }

  await supabaseAdmin.from('billing_subscriptions').upsert({
    user_id: userId,
    provider: 'revenuecat',
    provider_customer_id: userId,
    provider_subscription_id: data.transaction_id,
    plan: data.product_id?.includes('year') ? 'yearly' : 'monthly',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: expiresAt?.toISOString(),
    metadata: data,
  }, {
    onConflict: 'provider,provider_subscription_id',
  });

  if (isPro) {
    await supabaseAdmin.from('billing_entitlements').upsert({
      user_id: userId,
      feature_key: 'pro',
      status: 'active',
      source: 'revenuecat',
      expires_at: expiresAt?.toISOString(),
      metadata: data,
    }, {
      onConflict: 'user_id,feature_key',
    });
  }

  // Log transaction
  await supabaseAdmin.from('payment_transactions').insert({
    user_id: userId,
    type: 'subscription_purchase',
    amount: data.price,
    currency: data.currency,
    transaction_id: data.transaction_id,
    product_id: data.product_id,
    store: data.store,
    status: 'completed',
    description: `${isTrial ? 'Trial' : 'Subscription'} ${type === 'RENEWAL' ? 'renewal' : 'purchase'}`,
    metadata: data,
  });
}

async function handleSubscriptionCancelled(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  if (__DEV__) {
    console.log(`Subscription cancelled for user ${userId}`);
  }

  // Update subscription record
  await supabaseAdmin
    .from('subscriptions')
    .update({
      auto_renewing: false,
      will_renew: false,
      unsubscribe_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_id', data.transaction_id);

  // Note: Don't set is_pro to false yet - user still has access until expires_at
  await supabaseAdmin
    .from('billing_subscriptions')
    .update({
      cancel_at_period_end: true,
      metadata: data,
    })
    .eq('provider', 'revenuecat')
    .eq('provider_subscription_id', data.transaction_id);
}

async function handleSubscriptionExpired(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  if (__DEV__) {
    console.log(`Subscription expired for user ${userId}`);
  }

  // Update subscription record
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_id', data.transaction_id);

  // Sync pro status to false
  await supabaseAdmin.rpc('sync_subscription_status', {
    p_user_id: userId,
    p_is_pro: false,
  });

  await supabaseAdmin
    .from('billing_subscriptions')
    .update({
      status: 'expired',
      current_period_end: new Date().toISOString(),
      metadata: data,
    })
    .eq('provider', 'revenuecat')
    .eq('provider_subscription_id', data.transaction_id);

  await supabaseAdmin
    .from('billing_entitlements')
    .update({
      status: 'expired',
      expires_at: new Date().toISOString(),
      metadata: data,
    })
    .eq('user_id', userId)
    .eq('feature_key', 'pro');
}

async function handleOneTimePurchase(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  // Check if this is a credit purchase
  const isCreditPurchase = data.product_id.includes('credit');

  if (isCreditPurchase) {
    // Extract credit amount from product ID
    const creditAmounts: Record<string, number> = {
      'credits_small': 50,
      'credits_medium': 200,
      'credits_large': 500,
      'credits_xlarge': 1000,
    };

    const credits = creditAmounts[data.product_id] || 0;

    // Add credits to user profile
    await supabaseAdmin.rpc('add_credits', {
      p_user_id: userId,
      amount: credits,
      reason: `Credit purchase: ${data.product_id}`,
    });

    // Record the purchase
    await supabaseAdmin.from('credit_purchases').insert({
      user_id: userId,
      credits_purchased: credits,
      credits_granted: credits,
      amount_paid: data.price * 100, // Convert to cents
      currency: data.currency,
      product_id: data.product_id,
      store: data.store,
      transaction_id: data.transaction_id,
      status: 'completed',
      granted_at: new Date().toISOString(),
    });

    await supabaseAdmin.from('billing_transactions').upsert({
      user_id: userId,
      provider: 'revenuecat',
      provider_reference: data.transaction_id,
      type: 'credit_purchase',
      amount: data.price * 100,
      currency: data.currency,
      status: 'completed',
      metadata: {
        ...data,
        credits,
      },
    }, {
      onConflict: 'provider,provider_reference',
    });

    if (__DEV__) {
      console.log(`Added ${credits} credits to user ${userId}`);
    }
  }
}
