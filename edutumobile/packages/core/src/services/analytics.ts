/**
 * Analytics Service
 *
 * Tracks user events across the platform. Currently logs to console
 * with a documented integration path for PostHog, Mixpanel, or Amplitude.
 *
 * Integration guide:
 *   PostHog:  npx expo install posthog-react-native
 *   Mixpanel: npx expo install mixpanel-react-native
 *   Amplitude: npx expo install @amplitude/analytics-react-native
 */

export type AnalyticsEventName =
  | 'app_open'
  | 'screen_view'
  | 'opportunity_view'
  | 'opportunity_apply'
  | 'opportunity_bookmark'
  | 'opportunity_share'
  | 'goal_create'
  | 'goal_complete'
  | 'roadmap_generate'
  | 'roadmap_enroll'
  | 'paywall_view'
  | 'subscription_start'
  | 'credit_purchase'
  | 'credit_spend'
  | 'profile_complete'
  | 'creator_apply'
  | 'ai_chat_send'
  | 'search_perform'
  | 'notification_open'
  | 'error';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

type AnalyticsProvider = 'console' | 'posthog' | 'mixpanel' | 'amplitude';

let config = {
  provider: 'console' as AnalyticsProvider,
  enabled: true,
  debugMode: false,
};

const eventBuffer: AnalyticsEvent[] = [];
const MAX_BUFFER = 100;

export function configureAnalytics(cfg: Partial<typeof config>): void {
  config = { ...config, ...cfg };
}
export function setAnalyticsEnabled(enabled: boolean): void { config.enabled = enabled; }

export function trackEvent(name: AnalyticsEventName, properties?: Record<string, unknown>): void {
  if (!config.enabled) return;
  const event: AnalyticsEvent = { name, properties, timestamp: new Date().toISOString() };
  if (eventBuffer.length >= MAX_BUFFER) eventBuffer.shift();
  eventBuffer.push(event);
  if (config.debugMode) console.log(`[Analytics] ${name}:`, properties);
}
export function trackScreenView(screen: string, properties?: Record<string, unknown>): void {
  trackEvent('screen_view', { screen, ...properties });
}
export function trackError(error: Error, context?: Record<string, unknown>): void {
  trackEvent('error', { message: error.message, name: error.name, ...context });
}
export function flushEventBuffer(): AnalyticsEvent[] { const e = [...eventBuffer]; eventBuffer.length = 0; return e; }

export const analytics = {
  appOpen: () => trackEvent('app_open'),
  screenView: (s: string) => trackScreenView(s),
  opportunityView: (id: string, title: string) => trackEvent('opportunity_view', { opportunityId: id, title }),
  opportunityApply: (id: string, title: string) => trackEvent('opportunity_apply', { opportunityId: id, title }),
  opportunityBookmark: (id: string) => trackEvent('opportunity_bookmark', { opportunityId: id }),
  opportunityShare: (id: string) => trackEvent('opportunity_share', { opportunityId: id }),
  goalCreate: (category?: string) => trackEvent('goal_create', { category }),
  goalComplete: (id: string) => trackEvent('goal_complete', { goalId: id }),
  roadmapGenerate: (opportunityId: string) => trackEvent('roadmap_generate', { opportunityId }),
  paywallView: (source: string) => trackEvent('paywall_view', { source }),
  subscriptionStart: (plan: string) => trackEvent('subscription_start', { plan }),
  creditPurchase: (amount: number, pack: string) => trackEvent('credit_purchase', { amount, pack }),
  creditSpend: (amount: number, feature: string) => trackEvent('credit_spend', { amount, feature }),
  profileComplete: (pct: number) => trackEvent('profile_complete', { completenessPct: pct }),
  aiChatSend: (intent: string) => trackEvent('ai_chat_send', { intent }),
  search: (query: string, count: number) => trackEvent('search_perform', { query, resultCount: count }),
  notificationOpen: (kind: string) => trackEvent('notification_open', { kind }),
  error: (e: Error, ctx?: Record<string, unknown>) => trackError(e, ctx),
};
