import { Platform } from 'react-native';
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  PurchasesStoreProduct,
  LOG_LEVEL,
} from 'react-native-purchases';
import type { PRODUCT_CATEGORY } from 'react-native-purchases';

// PRODUCT_CATEGORY is imported as a TYPE only and re-created as a literal:
// pulling the enum in as a value would make this module depend on a runtime
// export that mocked/`test_`-key environments (jest, Expo Go) do not provide,
// and the whole file would explode on import. The string is the enum's own
// wire value.
const NON_SUBSCRIPTION = 'NON_SUBSCRIPTION' as PRODUCT_CATEGORY;

// ─── Configuration ───────────────────────────────────────────────────────────

const RAW_REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '',
  default: '',
});

// A `test_`-prefixed key is RevenueCat's Test Store (no App Store / Play
// products needed) — great for development, but it must never drive billing in
// a store-shipped build. In release builds we treat a test key as "no key",
// so the paywall degrades to its unconfigured behaviour instead of offering a
// non-functional purchase. Real store builds ship `appl_` / `goog_` keys.
const REVENUECAT_API_KEY =
  RAW_REVENUECAT_API_KEY.startsWith('test_') && !__DEV__ ? '' : RAW_REVENUECAT_API_KEY;

let isRevenueCatConfigured = false;
let configuredUserId: string | null = null;

// Entitlements (configured in RevenueCat dashboard)
export const ENTITLEMENTS = {
  PRO: 'pro',
  LITE: 'lite',
  SCHOLAR: 'scholar',
  CREDITS: 'credits',
} as const;

// Product identifiers (configured in RevenueCat dashboard)
export const PRODUCTS = {
  // Consumer subscriptions. Lite and Pro are separate store products.
  LITE_WEEKLY: 'lite_weekly',
  LITE_MONTHLY: 'lite_monthly',
  LITE_YEARLY: 'lite_yearly',
  SCHOLAR_WEEKLY: 'scholar_weekly',
  SCHOLAR_MONTHLY: 'scholar_monthly',
  SCHOLAR_YEARLY: 'scholar_yearly',
  PRO_WEEKLY: 'pro_weekly',
  PRO_MONTHLY: 'pro_monthly',
  PRO_YEARLY: 'pro_yearly',

  // One-off Season Pass (non-renewing) — grants Pro for a fixed run of days.
  // Manual step: create this non-renewing product in the RevenueCat dashboard
  // before enabling the season option on native.
  SEASON_PASS: 'season_pass',

  // Credit packages
  CREDITS_SMALL: 'credits_small',    // 50 credits
  CREDITS_MEDIUM: 'credits_medium',  // 200 credits
  CREDITS_LARGE: 'credits_large',    // 500 credits
  CREDITS_XLARGE: 'credits_xlarge',  // 1000 credits
} as const;

// Credit amounts per package
export const CREDIT_AMOUNTS: Record<string, number> = {
  [PRODUCTS.CREDITS_SMALL]: 50,
  [PRODUCTS.CREDITS_MEDIUM]: 200,
  [PRODUCTS.CREDITS_LARGE]: 500,
  [PRODUCTS.CREDITS_XLARGE]: 1000,
};

// ─── Initialization ─────────────────────────────────────────────────────────

let warnedMissingApiKey = false;

export type ServerFulfillmentCheck = () => Promise<boolean>;

export type ServerFulfillmentPollingOptions = {
  attempts?: number;
  intervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

/**
 * A store/checkout acknowledgement proves only that a provider accepted the
 * purchase. Money, credits, and entitlements are fulfilled asynchronously by
 * the server webhook, so UI callers must wait for their server-side projection
 * before showing a completed purchase.
 */
export async function waitForServerFulfillment(
  check: ServerFulfillmentCheck,
  {
    attempts = 6,
    intervalMs = 2_000,
    sleep = defaultSleep,
  }: ServerFulfillmentPollingOptions = {},
): Promise<boolean> {
  const totalAttempts = Math.max(1, attempts);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      if (await check()) return true;
    } catch (error) {
      console.warn('Server fulfillment check failed:', error);
    }

    if (attempt < totalAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  return false;
}

export async function initRevenueCat(userId: string): Promise<boolean> {
  if (!REVENUECAT_API_KEY) {
    // Expected state until the RevenueCat key ships — warn once, not per call.
    if (__DEV__ && !warnedMissingApiKey) {
      warnedMissingApiKey = true;
      console.warn('RevenueCat API key not configured (IAP disabled; web checkout is used instead)');
    }
    isRevenueCatConfigured = false;
    configuredUserId = null;
    return false;
  }

  try {
    if (!isRevenueCatConfigured) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      isRevenueCatConfigured = true;
    }

    // The raw Clerk/Supabase subject is the billing identity. Configure the SDK
    // once, then explicitly update its account identity when auth changes.
    if (configuredUserId !== userId) {
      await Purchases.logIn(userId);
      configuredUserId = userId;
    }
    return true;
  } catch (error) {
    console.error('Failed to initialize RevenueCat:', error);
    configuredUserId = null;
    return false;
  }
}

function canUseRevenueCat() {
  if (!REVENUECAT_API_KEY || !isRevenueCatConfigured) {
    return false;
  }

  return true;
}

// ─── Customer Info ──────────────────────────────────────────────────────────

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!canUseRevenueCat()) {
    return null;
  }

  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('Failed to get customer info:', error);
    return null;
  }
}

export async function isProSubscriber(): Promise<boolean> {
  const info = await getCustomerInfo();
  if (!info) return false;
  return info.entitlements.active[ENTITLEMENTS.PRO] !== undefined;
}

export async function getActiveEntitlements(): Promise<string[]> {
  const info = await getCustomerInfo();
  if (!info) return [];
  return Object.keys(info.entitlements.active);
}

// ─── Offerings & Products ───────────────────────────────────────────────────

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!canUseRevenueCat()) {
    return null;
  }

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.error('Failed to get offerings:', error);
    return null;
  }
}

export async function getAvailablePackages(): Promise<PurchasesPackage[]> {
  const offering = await getOfferings();
  return offering?.availablePackages || [];
}

export async function getSubscriptionProducts(): Promise<PurchasesStoreProduct[]> {
  const offering = await getOfferings();
  return (offering as any)?.subscriptionProducts || [];
}

// ─── Purchases ───────────────────────────────────────────────────────────────

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo: CustomerInfo | null; error?: string }> {
  if (!canUseRevenueCat()) {
    return { success: false, customerInfo: null, error: 'Payments are not configured yet' };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, customerInfo: null, error: 'User cancelled' };
    }
    return { success: false, customerInfo: null, error: error.message || 'Purchase failed' };
  }
}

export async function purchaseProduct(
  product: PurchasesStoreProduct
): Promise<{ success: boolean; customerInfo: CustomerInfo | null; error?: string }> {
  if (!canUseRevenueCat()) {
    return { success: false, customerInfo: null, error: 'Payments are not configured yet' };
  }

  try {
    // purchaseStoreProduct, not the deprecated purchaseProduct(identifier):
    // the identifier-only overload defaults to PURCHASE_TYPE.SUBS on Android,
    // so a consumable (credit pack) bought through it fails with a
    // product-not-found from Play Billing. Passing the real store product lets
    // the SDK use the category the product actually has.
    const { customerInfo } = await Purchases.purchaseStoreProduct(product);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, customerInfo: null, error: 'User cancelled' };
    }
    return { success: false, customerInfo: null, error: error.message || 'Purchase failed' };
  }
}

// ─── Restore Purchases ──────────────────────────────────────────────────────

export async function restorePurchases(): Promise<{ success: boolean; customerInfo: CustomerInfo | null; error?: string }> {
  if (!canUseRevenueCat()) {
    return { success: false, customerInfo: null, error: 'Payments are not configured yet' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error: any) {
    return { success: false, customerInfo: null, error: error.message || 'Restore failed' };
  }
}

// ─── Subscription Management ────────────────────────────────────────────────

export async function manageSubscriptions(): Promise<void> {
  if (!canUseRevenueCat()) {
    return;
  }

  try {
    await Purchases.showManageSubscriptions();
  } catch (error) {
    console.error('Failed to show manage subscriptions:', error);
  }
}

// ─── Credit Purchase Helper ─────────────────────────────────────────────────

// Resolve the REAL store product for an identifier. The old code cast
// `{ identifier } as PurchasesStoreProduct` and relied on purchaseProduct only
// ever reading `.identifier` — an implementation detail that stopped being true
// the moment we moved to purchaseStoreProduct (the native layer reads the
// product's category, price and, on Android, its offering token). A fabricated
// product would now crash or silently mis-purchase, so we always hand the SDK
// an object it produced itself.
async function resolveStoreProduct(productId: string): Promise<PurchasesStoreProduct | null> {
  if (!canUseRevenueCat()) {
    return null;
  }

  // Prefer the instance attached to the current offering: it is exactly what
  // the paywall priced, so the user is charged the amount they were shown.
  const packages = await getAvailablePackages();
  const fromOffering = packages.find((pkg) => pkg.product?.identifier === productId)?.product;
  if (fromOffering) {
    return fromOffering;
  }

  try {
    // Credit packs are consumables. getProducts defaults to subscriptions, so
    // without NON_SUBSCRIPTION this returns an empty array for every pack.
    const products = await Purchases.getProducts([productId], NON_SUBSCRIPTION);
    return products.find((product) => product.identifier === productId) ?? products[0] ?? null;
  } catch (error) {
    console.error('Failed to fetch store product:', error);
    return null;
  }
}

export async function purchaseCredits(
  productId: string
): Promise<{ success: boolean; credits: number; customerInfo: CustomerInfo | null; error?: string }> {
  const product = await resolveStoreProduct(productId);
  if (!product) {
    return {
      success: false,
      credits: 0,
      customerInfo: null,
      error: canUseRevenueCat()
        ? 'That credit pack is unavailable right now'
        : 'Payments are not configured yet',
    };
  }

  const result = await purchaseProduct(product);

  if (result.success && result.customerInfo) {
    const credits = CREDIT_AMOUNTS[productId] || 0;
    return { success: true, credits, customerInfo: result.customerInfo };
  }
  
  return { success: false, credits: 0, customerInfo: null, error: result.error };
}

// ─── Utility Functions ──────────────────────────────────────────────────────

export function formatPrice(price: string, _currency: string = 'USD'): string {
  return price;
}

export function getSubscriptionPeriod(period: string): string {
  switch (period) {
    case 'day': return '/day';
    case 'week': return '/week';
    case 'month': return '/month';
    case 'year': return '/year';
    default: return '';
  }
}
