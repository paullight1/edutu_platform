import { Platform } from 'react-native';
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOffering,
  PurchasesStoreProduct,
  LOG_LEVEL,
} from 'react-native-purchases';

// ─── Configuration ───────────────────────────────────────────────────────────

const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '',
  default: '',
});

let isRevenueCatConfigured = false;
let configuredUserId: string | null = null;

// Entitlements (configured in RevenueCat dashboard)
export const ENTITLEMENTS = {
  PRO: 'pro',
  CREDITS: 'credits',
} as const;

// Product identifiers (configured in RevenueCat dashboard)
export const PRODUCTS = {
  // Pro subscription
  PRO_MONTHLY: 'pro_monthly',
  PRO_YEARLY: 'pro_yearly',
  
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

export async function initRevenueCat(userId: string): Promise<boolean> {
  if (!REVENUECAT_API_KEY) {
    if (__DEV__) {
      console.warn('RevenueCat API key not configured');
    }
    isRevenueCatConfigured = false;
    configuredUserId = null;
    return false;
  }

  if (isRevenueCatConfigured && configuredUserId === userId) {
    return true;
  }

  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });
    isRevenueCatConfigured = true;
    configuredUserId = userId;
    return true;
  } catch (error) {
    console.error('Failed to initialize RevenueCat:', error);
    isRevenueCatConfigured = false;
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
    const { customerInfo } = await Purchases.purchaseProduct(product.identifier);
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

export async function purchaseCredits(
  productId: string
): Promise<{ success: boolean; credits: number; customerInfo: CustomerInfo | null; error?: string }> {
  const result = await purchaseProduct({ identifier: productId } as PurchasesStoreProduct);
  
  if (result.success && result.customerInfo) {
    const credits = CREDIT_AMOUNTS[productId] || 0;
    return { success: true, credits, customerInfo: result.customerInfo };
  }
  
  return { success: false, credits: 0, customerInfo: null, error: result.error };
}

// ─── Utility Functions ──────────────────────────────────────────────────────

export function formatPrice(price: string, currency: string = 'USD'): string {
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
