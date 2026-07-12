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
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  creditPacks: CreditPack[];
  aiCosts: AiCosts;
  freeTier: FreeTier;
  proFairUse: ProFairUse;
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
  weeklyPrice: 0,
  monthlyPrice: 0,
  yearlyPrice: 0,
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
  proFairUse: { dailyChatMessages: 200, dailyActionCredits: 500 },
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
