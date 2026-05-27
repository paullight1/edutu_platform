import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  BillingInterval,
  BillingStatus,
  CreateCheckoutDto,
} from './dto/billing.dto';

const PRO_FEATURES = [
  'ai_roadmap',
  'ai_chat',
  'cv_builder',
  'premium_templates',
  'marketplace_premium',
  'creator_tools',
] as const;

const PLAN_CONFIG: Record<
  BillingInterval,
  { amount: number; label: string; envPlanCode: string }
> = {
  monthly: {
    amount: 1000,
    label: 'Edutu Pro Monthly',
    envPlanCode: 'PAYSTACK_PLAN_MONTHLY',
  },
  yearly: {
    amount: 7200,
    label: 'Edutu Pro Yearly',
    envPlanCode: 'PAYSTACK_PLAN_YEARLY',
  },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private supabase: SupabaseClient | null = null;

  async getStatus(userId: string): Promise<BillingStatus> {
    if (!userId) {
      throw new BadRequestException('Missing user id');
    }

    const supabase = this.getSupabase();
    let profile: any = null;
    let activeEntitlements: any[] = [];
    let activeSubscription: any = null;

    if (supabase) {
      const profileResult = await supabase
        .from('profiles')
        .select('is_pro, pro_since, pro_expires_at, credits')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileResult.error) {
        this.logger.warn(
          `Unable to load billing profile for ${userId}: ${profileResult.error.message}`,
        );
      } else {
        profile = profileResult.data;
      }

      const entitlementResult = await supabase
        .from('billing_entitlements')
        .select('feature_key, expires_at, status')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (!entitlementResult.error) {
        const now = Date.now();
        activeEntitlements = (entitlementResult.data ?? []).filter((item) => {
          return !item.expires_at || new Date(item.expires_at).getTime() > now;
        });
      }

      const subscriptionResult = await supabase
        .from('billing_subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!subscriptionResult.error) {
        activeSubscription = subscriptionResult.data;
      }
    }

    const proExpiresAt =
      profile?.pro_expires_at ?? activeSubscription?.current_period_end ?? null;
    const profileProActive =
      Boolean(profile?.is_pro) &&
      (!proExpiresAt || new Date(proExpiresAt).getTime() > Date.now());
    const entitlementProActive = activeEntitlements.some(
      (item) => item.feature_key === 'pro',
    );
    const isPro = profileProActive || entitlementProActive;
    const entitlements = new Set(
      activeEntitlements.map((item) => item.feature_key),
    );
    if (isPro) entitlements.add('pro');

    const featureAccess: Record<string, boolean> = {};
    for (const feature of PRO_FEATURES) {
      featureAccess[feature] = isPro || entitlements.has(feature);
    }

    return {
      isPro,
      proSince: profile?.pro_since ?? null,
      proExpiresAt,
      credits: Number(profile?.credits ?? 0),
      subscriptionStatus:
        activeSubscription?.status ?? (isPro ? 'active' : null),
      entitlements: Array.from(entitlements),
      featureAccess,
    };
  }

  async createCheckout(
    userId: string,
    email: string | undefined,
    dto: CreateCheckoutDto,
  ) {
    if (!userId) throw new BadRequestException('Missing user id');
    if (!email) throw new BadRequestException('A billing email is required');

    const plan: BillingInterval = dto.plan === 'yearly' ? 'yearly' : 'monthly';
    const config = PLAN_CONFIG[plan];
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicUrl =
      process.env.BILLING_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      process.env.ADMIN_URL ||
      'http://localhost:5173';

    if (!secretKey) {
      return {
        provider: 'paystack',
        configured: false,
        message: 'PAYSTACK_SECRET_KEY is not configured on the API server.',
      };
    }

    const reference = `edutu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const callbackUrl = new URL('/billing/success', publicUrl);
    callbackUrl.searchParams.set('reference', reference);
    if (dto.returnTo) callbackUrl.searchParams.set('returnTo', dto.returnTo);

    const body: Record<string, unknown> = {
      email,
      amount: config.amount * 100,
      currency: 'NGN',
      reference,
      callback_url: callbackUrl.toString(),
      metadata: {
        user_id: userId,
        plan,
        feature: dto.feature ?? 'pro',
        return_to: dto.returnTo ?? null,
      },
    };

    const planCode = process.env[config.envPlanCode];
    if (planCode) {
      body.plan = planCode;
    }

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const result: any = await response.json().catch(() => null);
    if (!response.ok || !result?.status || !result?.data?.authorization_url) {
      this.logger.error(`Paystack checkout failed: ${JSON.stringify(result)}`);
      throw new InternalServerErrorException(
        'Unable to initialize payment checkout',
      );
    }

    await this.insertTransaction({
      user_id: userId,
      provider: 'paystack',
      provider_reference: reference,
      type: 'subscription',
      amount: config.amount,
      currency: 'NGN',
      status: 'pending',
      metadata: body.metadata,
    });

    return {
      provider: 'paystack',
      configured: true,
      reference,
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
    };
  }

  async handlePaystackWebhook(
    rawBody: Buffer,
    payload: any,
    signature?: string,
  ) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException('Paystack is not configured');
    }

    if (
      !signature ||
      !this.verifyPaystackSignature(rawBody, signature, secretKey)
    ) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    if (payload?.event !== 'charge.success') {
      return { received: true, ignored: true };
    }

    const data = payload.data ?? {};
    const userId = data.metadata?.user_id;
    const plan = data.metadata?.plan === 'yearly' ? 'yearly' : 'monthly';
    const reference = data.reference;

    if (!userId || !reference) {
      throw new BadRequestException('Webhook missing metadata');
    }

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (plan === 'yearly' ? 12 : 1));

    const supabase = this.getSupabase();
    if (!supabase) {
      throw new InternalServerErrorException('Supabase is not configured');
    }

    await supabase.from('billing_transactions').upsert(
      {
        user_id: userId,
        provider: 'paystack',
        provider_reference: reference,
        type: 'subscription',
        amount: Math.round(Number(data.amount ?? 0) / 100),
        currency: data.currency ?? 'NGN',
        status: 'completed',
        metadata: data,
      },
      { onConflict: 'provider,provider_reference' },
    );

    await supabase.from('billing_subscriptions').upsert(
      {
        user_id: userId,
        provider: 'paystack',
        provider_customer_id: data.customer?.customer_code ?? null,
        provider_subscription_id:
          data.subscription?.subscription_code ?? reference,
        plan,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        metadata: data,
      },
      { onConflict: 'provider,provider_subscription_id' },
    );

    await supabase.from('billing_entitlements').upsert(
      {
        user_id: userId,
        feature_key: 'pro',
        status: 'active',
        source: 'paystack',
        expires_at: periodEnd.toISOString(),
      },
      { onConflict: 'user_id,feature_key' },
    );

    await supabase
      .from('profiles')
      .update({
        is_pro: true,
        pro_since: new Date().toISOString(),
        pro_expires_at: periodEnd.toISOString(),
      })
      .eq('user_id', userId);

    return { received: true };
  }

  private getSupabase(): SupabaseClient | null {
    if (this.supabase) return this.supabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.supabase;
  }

  private async insertTransaction(record: Record<string, unknown>) {
    const supabase = this.getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('billing_transactions')
      .upsert(record, {
        onConflict: 'provider,provider_reference',
      });
    if (error) {
      this.logger.warn(
        `Unable to record billing transaction: ${error.message}`,
      );
    }
  }

  private verifyPaystackSignature(
    rawBody: Buffer,
    signature: string,
    secretKey: string,
  ): boolean {
    const digest = createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');
    const received = Buffer.from(signature, 'hex');
    const expected = Buffer.from(digest, 'hex');
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  }
}
