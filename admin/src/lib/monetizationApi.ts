import { backendFetchJson } from './backend';

export interface CreditPack {
  credits: number;
  price: number;
  label: string;
}

export interface AiCosts {
  chatMessage: number;
  roadmapGeneration: number;
  copilotKit: number;
  copilotAssist: number;
  cvAi: number;
  voicePerMinute: number;
}

export interface FreeTier {
  dailyChatMessages: number;
  signupCredits: number;
}

export interface ProFairUse {
  dailyChatMessages: number;
  dailyActionCredits: number;
  dailyVoiceMinutes: number;
}

export interface PlanPricing {
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface PromoConfig {
  active: boolean;
  label: string;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
}

export interface PricingSettings {
  currency: string;
  /** Fixed USD→NGN rate for folding mobile-store (USD) revenue into NGN stats. */
  usdToNgnRate: number;
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  lite: PlanPricing;
  pro: PlanPricing;
  scholar: PlanPricing;
  creditPacks: CreditPack[];
  aiCosts: AiCosts;
  freeTier: FreeTier;
  proFairUse: ProFairUse;
  liteFairUse: ProFairUse;
  scholarFairUse: ProFairUse;
  checkoutBaseUrl: string;
  manageUrl: string;
  promo: PromoConfig;
}

export interface AdminSettings extends Record<string, unknown> {
  pricing?: Partial<PricingSettings>;
}

export interface BillingTransaction {
  id: string;
  user_id: string;
  provider: string;
  provider_reference: string | null;
  type: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface BillingOverview {
  pricing?: Partial<PricingSettings>;
  revenue: {
    month_revenue: number;
    last_30d_revenue: number;
    total_revenue: number;
    last_30d_count: number;
  };
  activeSubscriptions: Array<{ plan: string; count: number }>;
  credits30d: { purchased: number; spent: number; granted: number };
  topCreditSpenders30d: Array<{ user_id: string; credits_spent: number }>;
  aiUsageToday: {
    chat_messages_today: number;
    action_credits_today: number;
    active_ai_users_today: number;
  };
  recentTransactions: BillingTransaction[];
}

export const DEFAULT_PRICING: PricingSettings = {
  currency: 'NGN',
  usdToNgnRate: 1000,
  weeklyPrice: 0,
  monthlyPrice: 0,
  yearlyPrice: 0,
  lite: { weeklyPrice: 3.99, monthlyPrice: 10, yearlyPrice: 100 },
  pro: { weeklyPrice: 5, monthlyPrice: 15, yearlyPrice: 150 },
  scholar: { weeklyPrice: 7.99, monthlyPrice: 24.99, yearlyPrice: 200 },
  creditPacks: [],
  aiCosts: {
    chatMessage: 1,
    roadmapGeneration: 5,
    copilotKit: 10,
    copilotAssist: 3,
    cvAi: 5,
    voicePerMinute: 2,
  },
  freeTier: { dailyChatMessages: 10, signupCredits: 20 },
  proFairUse: { dailyChatMessages: 200, dailyActionCredits: 300, dailyVoiceMinutes: 30 },
  liteFairUse: { dailyChatMessages: 20, dailyActionCredits: 30, dailyVoiceMinutes: 5 },
  scholarFairUse: { dailyChatMessages: 600, dailyActionCredits: 900, dailyVoiceMinutes: 60 },
  checkoutBaseUrl: '',
  manageUrl: '',
  promo: {
    active: false,
    label: '',
    weeklyPrice: null,
    monthlyPrice: null,
    yearlyPrice: null,
  },
};

export function mergePricing(pricing?: Partial<PricingSettings>): PricingSettings {
  return {
    ...DEFAULT_PRICING,
    ...(pricing || {}),
    creditPacks: pricing?.creditPacks ?? DEFAULT_PRICING.creditPacks,
    aiCosts: { ...DEFAULT_PRICING.aiCosts, ...(pricing?.aiCosts || {}) },
    freeTier: { ...DEFAULT_PRICING.freeTier, ...(pricing?.freeTier || {}) },
    proFairUse: { ...DEFAULT_PRICING.proFairUse, ...(pricing?.proFairUse || {}) },
    liteFairUse: { ...DEFAULT_PRICING.liteFairUse, ...(pricing?.liteFairUse || {}) },
    scholarFairUse: { ...DEFAULT_PRICING.scholarFairUse, ...(pricing?.scholarFairUse || {}) },
    lite: { ...DEFAULT_PRICING.lite, ...(pricing?.lite || {}) },
    pro: { ...DEFAULT_PRICING.pro, ...(pricing?.pro || {}) },
    scholar: { ...DEFAULT_PRICING.scholar, ...(pricing?.scholar || {}) },
    promo: { ...DEFAULT_PRICING.promo, ...(pricing?.promo || {}) },
  };
}

export interface VoiceUsageSummary {
  success: boolean;
  days: number;
  pricing: { ttsPerMinuteUsd: number; sttPerMinuteUsd: number };
  totals: {
    ttsSeconds: number;
    sttSeconds: number;
    ttsRequests: number;
    sttRequests: number;
    activeUsers: number;
    estimatedCostUsd: number;
  };
  perDay: Array<{
    day: string;
    ttsSeconds: number;
    sttSeconds: number;
    requests: number;
    estimatedCostUsd: number;
  }>;
  perVoice: Array<{ voice: string; requests: number; ttsSeconds: number }>;
  error?: string;
}

export const monetizationApi = {
  getSettings() {
    return backendFetchJson<{ success: boolean; settings: AdminSettings }>('/admin/settings');
  },
  saveSettings(settings: AdminSettings) {
    return backendFetchJson<{ success: boolean; settings: AdminSettings }>('/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },
  getOverview() {
    return backendFetchJson<BillingOverview>('/billing/admin/overview');
  },
  getTransactions(limit: number, offset: number) {
    return backendFetchJson<{ transactions: BillingTransaction[] }>(
      `/billing/admin/transactions?limit=${limit}&offset=${offset}`,
    );
  },
  getVoiceUsage(days = 30) {
    return backendFetchJson<VoiceUsageSummary>(`/admin/ai-usage/voice?days=${days}`);
  },
};
