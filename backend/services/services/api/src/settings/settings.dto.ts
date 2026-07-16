import { z } from "zod";

const PlatformSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  supportEmail: z.string().trim().email(),
  maintenanceMode: z.boolean(),
  allowRegistrations: z.boolean(),
  requireApproval: z.boolean(),
});

const ContentSettingsSchema = z.object({
  autoModerate: z.boolean(),
  requireCreatorApproval: z.boolean(),
  maxUploadSize: z.number().int().min(1).max(100),
  allowedFileTypes: z.array(z.string().trim().min(1).max(20)).max(20),
});

const NotificationSettingsSchema = z.object({
  adminEmail: z.string().trim().email(),
  notifyNewUsers: z.boolean(),
  notifyNewOpportunities: z.boolean(),
  notifyReports: z.boolean(),
  dailyDigest: z.boolean(),
});

const SecuritySettingsSchema = z.object({
  maxLoginAttempts: z.number().int().min(3).max(10),
  passwordMinLength: z.number().int().min(6).max(128),
  requireStrongPassword: z.boolean(),
  sessionDuration: z.number().int().min(1).max(168),
});

const ApiSettingsSchema = z.object({
  apiKey: z.string().trim().min(1).max(120),
  webhookUrl: z.string().trim().url(),
  rateLimitPerMinute: z.number().int().min(10).max(1000),
});

// Remote control for the mobile app: forced upgrades, maintenance lockout and
// per-module access locks. Served (read-only) on the public
// GET /mobile-control/config endpoint, so keep this free of secrets.
export const ModuleAccessSchema = z.enum(["free", "pro", "disabled"]);

const MobileForceUpdateSchema = z.object({
  enabled: z.boolean(),
  // Lowest app version allowed to run; anything older gets the blocking gate.
  minVersion: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){0,3}$/, "minVersion must look like 1.2.3"),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  iosStoreUrl: z.string().trim().max(500),
  androidStoreUrl: z.string().trim().max(500),
  // Try an expo-updates OTA fetch+reload before sending users to the store.
  otaFirst: z.boolean(),
});

const MobileMaintenanceSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
});

const MobileAppSettingsSchema = z.object({
  forceUpdate: MobileForceUpdateSchema,
  maintenance: MobileMaintenanceSchema,
  // moduleKey -> access level; unknown keys default to "free" on the client.
  moduleLocks: z.record(z.string().max(60), ModuleAccessSchema),
});

// Admin-controlled subscription pricing shown on the paywall and used by
// pay.edutu.org. PUBLIC (served on GET /mobile-control/config) — never put a
// payment secret here; Paystack keys live on pay.edutu.org.
const PricingPromoSchema = z.object({
  active: z.boolean(),
  label: z.string().trim().max(120),
  weeklyPrice: z.number().min(0).max(10_000_000).nullable().default(null),
  monthlyPrice: z.number().min(0).max(10_000_000).nullable(),
  yearlyPrice: z.number().min(0).max(10_000_000).nullable(),
});

// One purchasable credit bundle. Server-side checkout only accepts packs from
// this list, so the admin fully controls what can be bought and for how much.
const CreditPackSchema = z.object({
  credits: z.number().int().min(1).max(1_000_000),
  price: z.number().min(0).max(10_000_000),
  label: z.string().trim().max(60).default(""),
});

// Credit price of each AI action. Debited server-side by the metering
// interceptor for non-Pro users; Pro users count against the fair-use caps.
const AiCostsSchema = z.object({
  chatMessage: z.number().int().min(0).max(1000),
  roadmapGeneration: z.number().int().min(0).max(10_000),
  copilotKit: z.number().int().min(0).max(10_000),
  copilotAssist: z.number().int().min(0).max(10_000),
  cvAi: z.number().int().min(0).max(10_000),
  voicePerMinute: z.number().int().min(0).max(10_000),
});

const FreeTierSchema = z.object({
  // Free chat messages per day before credits are debited / paywall shows.
  dailyChatMessages: z.number().int().min(0).max(10_000),
  signupCredits: z.number().int().min(0).max(100_000),
});

// Fair-use ceilings for Pro subscribers — "unlimited" with an abuse backstop.
const ProFairUseSchema = z.object({
  dailyChatMessages: z.number().int().min(0).max(100_000),
  dailyActionCredits: z.number().int().min(0).max(1_000_000),
});

// Admin-controlled paywall design + copy, delivered over the same remote
// config channel as pricing (public GET /mobile-control/config) so a change
// reaches installed apps without a store release. Every field defaults to
// empty = "use the app's built-in translated copy" — a partial edit can never
// blank the paywall. Kept as its own top-level group (not inside pricing)
// because older admin clients rebuild the pricing object from known keys on
// save and would silently strip unknown nested fields.
const PaywallSettingsSchema = z.object({
  // Two-line hero headline: line 1 renders in the accent color, line 2 white.
  heroLine1: z.string().trim().max(80).default(""),
  heroLine2: z.string().trim().max(80).default(""),
  subtitle: z.string().trim().max(240).default(""),
  // Label on the big subscribe button.
  ctaLabel: z.string().trim().max(60).default(""),
  // Reassurance line under the CTA (web-checkout flow only; the iOS IAP
  // renewal disclosure is fixed for App Store compliance).
  secureNote: z.string().trim().max(300).default(""),
  // Merchandising chip above each plan card.
  badgeWeekly: z.string().trim().max(30).default(""),
  badgeMonthly: z.string().trim().max(30).default(""),
  badgeYearly: z.string().trim().max(30).default(""),
  // Optional benefit bullets rendered between the headline and plan cards;
  // empty = no bullet list (the default reference design).
  features: z.array(z.string().trim().max(80)).max(6).default([]),
  // Hex accent for highlights (selected plan, badges); empty = app default.
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .or(z.literal(""))
    .default(""),
  // 'collage' = poster mosaic hero; 'gradient' = plain gradient backdrop.
  heroStyle: z.enum(["collage", "gradient"]).default("collage"),
  // Plan card pre-selected when the paywall opens.
  defaultPlan: z.enum(["weekly", "monthly", "yearly"]).default("weekly"),
});

// Admin-managed content for the public web app (served unauthenticated on
// GET /public/web-config), starting with the dashboard hero carousel. Keep
// every field defaulted/lenient: admin_settings writes must stay within this
// schema or mergeAdminSettings parse throws and ALL settings fall back to
// defaults. No secrets here — this group is public.
const WebHeroBannerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(300).default(""),
  // Deliberately not z.url(): a malformed stored URL must degrade to a broken
  // image on the web client, not blow up the entire settings merge.
  imageUrl: z.string().trim().min(1).max(1000),
  linkUrl: z.string().trim().max(1000).default(""),
  enabled: z.boolean().default(true),
});

const WebContentSettingsSchema = z.object({
  heroBanners: z.array(WebHeroBannerSchema).max(8).default([]),
});

// Admin knobs for user-submitted content (community opportunity submissions).
// The policy is public (mirrored on GET /public/web-config as `submissions`)
// — no secrets here. Own top-level group (not inside `content`) because older
// admin clients rebuild known groups from known keys on save and would
// silently strip unknown nested fields. Every field is defaulted so a write
// that omits the group can never break the mergeAdminSettings parse.
const UserContentSettingsSchema = z.object({
  // Submissions stay in the admin review queue until approved; off = a user
  // submission publishes to the catalog immediately.
  requireApproval: z.boolean().default(true),
  // Charge credits for each user submission (cost below).
  paidSubmissions: z.boolean().default(false),
  submissionCostCredits: z.number().int().min(0).max(100_000).default(0),
});

const PricingSettingsSchema = z.object({
  currency: z.string().trim().min(3).max(4),
  weeklyPrice: z.number().min(0).max(10_000_000).default(2000),
  monthlyPrice: z.number().min(0).max(10_000_000),
  yearlyPrice: z.number().min(0).max(10_000_000),
  creditPacks: z.array(CreditPackSchema).max(8).default([]),
  aiCosts: AiCostsSchema.default({
    chatMessage: 1,
    roadmapGeneration: 10,
    copilotKit: 15,
    copilotAssist: 5,
    cvAi: 10,
    voicePerMinute: 5,
  }),
  freeTier: FreeTierSchema.default({
    dailyChatMessages: 10,
    signupCredits: 50,
  }),
  proFairUse: ProFairUseSchema.default({
    dailyChatMessages: 200,
    dailyActionCredits: 300,
  }),
  checkoutBaseUrl: z.string().trim().url().max(300),
  manageUrl: z.string().trim().url().max(300),
  promo: PricingPromoSchema,
});

export const AdminSettingsSchema = z.object({
  platform: PlatformSettingsSchema,
  content: ContentSettingsSchema,
  notifications: NotificationSettingsSchema,
  security: SecuritySettingsSchema,
  api: ApiSettingsSchema,
  // Optional so clients that predate app control (e.g. the external web admin
  // portal) can still PUT the old shape; updateSettings preserves the current
  // stored value when the group is absent from the payload.
  mobileApp: MobileAppSettingsSchema.optional(),
  pricing: PricingSettingsSchema.optional(),
  paywall: PaywallSettingsSchema.optional(),
  webContent: WebContentSettingsSchema.optional(),
  userContent: UserContentSettingsSchema.optional(),
});

export type ModuleAccess = z.infer<typeof ModuleAccessSchema>;
export type MobileAppSettings = z.infer<typeof MobileAppSettingsSchema>;
export type PricingSettings = z.infer<typeof PricingSettingsSchema>;
export type PaywallSettings = z.infer<typeof PaywallSettingsSchema>;
export type WebHeroBanner = z.infer<typeof WebHeroBannerSchema>;
export type WebContentSettings = z.infer<typeof WebContentSettingsSchema>;
export type UserContentSettings = z.infer<typeof UserContentSettingsSchema>;

export type AdminSettingsDto = z.infer<typeof AdminSettingsSchema>;

// Stored/merged settings always carry the mobileApp + pricing groups (defaults
// fill them); only inbound payloads may omit them.
type ResolvedAdminSettings = AdminSettingsDto & {
  mobileApp: MobileAppSettings;
  pricing: PricingSettings;
  paywall: PaywallSettings;
  webContent: WebContentSettings;
  userContent: UserContentSettings;
};

export interface AdminSettingsResponse {
  success: boolean;
  source: "database" | "fallback";
  settings: AdminSettingsDto;
  error?: string;
}

export const DEFAULT_ADMIN_SETTINGS: ResolvedAdminSettings = {
  platform: {
    siteName: "Edutu",
    supportEmail: "support@edutu.org",
    maintenanceMode: false,
    allowRegistrations: true,
    requireApproval: false,
  },
  content: {
    autoModerate: true,
    requireCreatorApproval: true,
    maxUploadSize: 10,
    allowedFileTypes: ["jpg", "jpeg", "png", "pdf"],
  },
  notifications: {
    adminEmail: "admin@edutu.org",
    notifyNewUsers: true,
    notifyNewOpportunities: false,
    notifyReports: true,
    dailyDigest: true,
  },
  security: {
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireStrongPassword: true,
    sessionDuration: 24,
  },
  api: {
    apiKey: "Managed on the server",
    webhookUrl: "https://api.edutu.org/webhooks",
    rateLimitPerMinute: 100,
  },
  mobileApp: {
    forceUpdate: {
      enabled: false,
      minVersion: "1.0.0",
      title: "Update required",
      message:
        "This version of Edutu is no longer supported. Please update to keep going.",
      iosStoreUrl: "",
      androidStoreUrl:
        "https://play.google.com/store/apps/details?id=com.edutu.com",
      otaFirst: true,
    },
    maintenance: {
      enabled: false,
      title: "We'll be right back",
      message:
        "Edutu is undergoing scheduled maintenance. Please check back shortly.",
    },
    moduleLocks: {},
  },
  // Nigeria-first pricing (NGN, Paystack). Sustainability model 2026-07:
  // covers 3-person payroll + infra at ~100 paying subscribers.
  pricing: {
    currency: "NGN",
    weeklyPrice: 2000,
    monthlyPrice: 6500,
    yearlyPrice: 60000,
    creditPacks: [
      { credits: 100, price: 1500, label: "Starter" },
      { credits: 250, price: 3000, label: "Best value" },
      { credits: 700, price: 7000, label: "Power" },
    ],
    aiCosts: {
      chatMessage: 1,
      roadmapGeneration: 10,
      copilotKit: 15,
      copilotAssist: 5,
      cvAi: 10,
      voicePerMinute: 5,
    },
    freeTier: { dailyChatMessages: 10, signupCredits: 50 },
    proFairUse: { dailyChatMessages: 200, dailyActionCredits: 300 },
    checkoutBaseUrl: "https://pay.edutu.org",
    manageUrl: "https://pay.edutu.org/account",
    promo: {
      active: false,
      label: "",
      weeklyPrice: null,
      monthlyPrice: null,
      yearlyPrice: null,
    },
  },
  // Empty everywhere = the app renders its own built-in translated copy.
  paywall: {
    heroLine1: "",
    heroLine2: "",
    subtitle: "",
    ctaLabel: "",
    secureNote: "",
    badgeWeekly: "",
    badgeMonthly: "",
    badgeYearly: "",
    features: [],
    accentColor: "",
    heroStyle: "collage",
    defaultPlan: "weekly",
  },
  // No banners = the web app keeps its built-in hardcoded hero carousel.
  webContent: {
    heroBanners: [],
  },
  // User submissions: reviewed before publishing, free to submit.
  userContent: {
    requireApproval: true,
    paidSubmissions: false,
    submissionCostCredits: 0,
  },
};

export function mergeAdminSettings(value: unknown): ResolvedAdminSettings {
  const partial =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AdminSettingsDto>)
      : {};

  return AdminSettingsSchema.parse({
    platform: {
      ...DEFAULT_ADMIN_SETTINGS.platform,
      ...(partial.platform ?? {}),
    },
    content: {
      ...DEFAULT_ADMIN_SETTINGS.content,
      ...(partial.content ?? {}),
    },
    notifications: {
      ...DEFAULT_ADMIN_SETTINGS.notifications,
      ...(partial.notifications ?? {}),
    },
    security: {
      ...DEFAULT_ADMIN_SETTINGS.security,
      ...(partial.security ?? {}),
    },
    api: {
      ...DEFAULT_ADMIN_SETTINGS.api,
      ...(partial.api ?? {}),
    },
    mobileApp: {
      forceUpdate: {
        ...DEFAULT_ADMIN_SETTINGS.mobileApp.forceUpdate,
        ...(partial.mobileApp?.forceUpdate ?? {}),
      },
      maintenance: {
        ...DEFAULT_ADMIN_SETTINGS.mobileApp.maintenance,
        ...(partial.mobileApp?.maintenance ?? {}),
      },
      moduleLocks:
        partial.mobileApp?.moduleLocks ??
        DEFAULT_ADMIN_SETTINGS.mobileApp.moduleLocks,
    },
    pricing: {
      ...DEFAULT_ADMIN_SETTINGS.pricing,
      ...(partial.pricing ?? {}),
      creditPacks:
        partial.pricing?.creditPacks ??
        DEFAULT_ADMIN_SETTINGS.pricing.creditPacks,
      aiCosts: {
        ...DEFAULT_ADMIN_SETTINGS.pricing.aiCosts,
        ...(partial.pricing?.aiCosts ?? {}),
      },
      freeTier: {
        ...DEFAULT_ADMIN_SETTINGS.pricing.freeTier,
        ...(partial.pricing?.freeTier ?? {}),
      },
      proFairUse: {
        ...DEFAULT_ADMIN_SETTINGS.pricing.proFairUse,
        ...(partial.pricing?.proFairUse ?? {}),
      },
      promo: {
        ...DEFAULT_ADMIN_SETTINGS.pricing.promo,
        ...(partial.pricing?.promo ?? {}),
      },
    },
    paywall: {
      ...DEFAULT_ADMIN_SETTINGS.paywall,
      ...(partial.paywall ?? {}),
      features:
        partial.paywall?.features ?? DEFAULT_ADMIN_SETTINGS.paywall.features,
    },
    webContent: {
      heroBanners:
        partial.webContent?.heroBanners ??
        DEFAULT_ADMIN_SETTINGS.webContent.heroBanners,
    },
    userContent: {
      ...DEFAULT_ADMIN_SETTINGS.userContent,
      ...(partial.userContent ?? {}),
    },
    // mobileApp, pricing, paywall, webContent + userContent are always constructed above;
    // the schema marks them optional only for inbound payload compatibility.
  }) as ResolvedAdminSettings;
}
