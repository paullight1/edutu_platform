import type { PaywallSettings } from "../settings/settings.dto";

export type JsonRecord = Record<string, unknown>;

export interface MobileCampaign {
  id: string;
  key: string;
  title: string;
  body?: string | null;
  campaign_type: string;
  placement: string;
  status: string;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  audience: JsonRecord;
  creative: JsonRecord;
  frequency: JsonRecord;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MobileFeatureFlag {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  enabled: boolean;
  default_value: unknown;
  rollout: JsonRecord;
  requires_pro: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface WidgetFeed {
  id: string;
  key: string;
  title: string;
  feed_type: string;
  placement: string;
  status: string;
  items: JsonRecord[];
  audience: JsonRecord;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ModuleAccess = "free" | "pro" | "disabled";

// One admin-composed home block, as delivered to the app (published only).
export interface HomeBlockConfig {
  id: string;
  type: string;
  props: JsonRecord;
  enabled: boolean;
}

// One admin-defined web-backed feature, as delivered to the app (enabled only).
export interface CustomFeatureConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  url: string;
  openMode: "webview" | "external";
  placement: "home" | "tools" | "both";
  enabled: boolean;
}

// Admin-controlled app gating, sourced from admin_settings.mobileApp and
// mirrored into the public config payload the app polls at launch.
export interface AppControlConfig {
  forceUpdate: {
    enabled: boolean;
    minVersion: string;
    title: string;
    message: string;
    iosStoreUrl: string;
    androidStoreUrl: string;
    otaFirst: boolean;
  };
  maintenance: {
    enabled: boolean;
    title: string;
    message: string;
  };
  moduleLocks: Record<string, ModuleAccess>;
  // Simple on/off reveal flags for dark-shipped features.
  featureFlags: Record<string, boolean>;
  // Published home layout only — the admin's draft never leaves the server.
  homeLayout: HomeBlockConfig[];
  // Enabled custom features only.
  customFeatures: CustomFeatureConfig[];
}

// Admin-controlled subscription pricing (admin_settings.pricing), served
// read-only so the paywall + pay.edutu.org share one source. Public — no
// payment secrets here.
export interface PricingConfig {
  currency: string;
  monthlyPrice: number;
  yearlyPrice: number;
  checkoutBaseUrl: string;
  manageUrl: string;
  promo: {
    active: boolean;
    label: string;
    monthlyPrice: number | null;
    yearlyPrice: number | null;
  };
}

// Admin-controlled paywall design + copy (admin_settings.paywall) — same
// remote-config delivery as pricing, so paywall changes ship without a store
// release. Empty fields mean "use the app's built-in copy".
export type PaywallContentConfig = PaywallSettings;

// Effective per-action AI credit costs the metering enforces
// (admin_settings.pricing.aiCosts), surfaced so the app can price the
// Application Co-pilot preflight + CTA copy from one source of truth instead
// of hardcoding it. Public — these are the same numbers the paywall shows.
export interface AiCostsConfig {
  copilotKit: number;
  copilotAssist: number;
}

export interface MobileControlConfig {
  campaigns: MobileCampaign[];
  featureFlags: MobileFeatureFlag[];
  widgetFeeds: WidgetFeed[];
  appControl: AppControlConfig;
  pricing: PricingConfig;
  paywall: PaywallContentConfig;
  aiCosts: AiCostsConfig;
  serverTime: string;
}

export interface CampaignEventDto {
  campaignId?: string;
  eventType: "impression" | "click" | "dismiss" | "conversion";
  metadata?: JsonRecord;
}
