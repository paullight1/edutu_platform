import { createContext } from "react";
import type { BillingStatus } from "../services/billing";

export interface OpenPaywallInput {
  /** Contextual line shown in the modal, e.g. a 402 message. */
  reason?: string | null;
  /** The feature the user was trying to use (analytics / copy hints). */
  feature?: string | null;
}

export interface PaywallContextValue {
  /** True when the signed-in user has an active Pro entitlement. */
  isPro: boolean;
  planTier: BillingStatus['planTier'];
  /** Full billing status (credits, expiry, transactions) or null when signed out. */
  billing: BillingStatus | null;
  billingLoading: boolean;
  billingError: string | null;
  /** Open the upgrade modal with optional context. */
  openPaywall: (input?: OpenPaywallInput) => void;
  closePaywall: () => void;
  /** Re-fetch billing status (e.g. after returning from checkout). */
  refreshBilling: () => Promise<void> | void;
  /**
   * If `error` is an UpgradeRequiredError (backend 402 / metered limit), open
   * the paywall and return true so the caller can stop. Otherwise return false
   * so the caller handles/rethrows the error normally.
   */
  handleUpgradeError: (error: unknown) => boolean;
}

export const PaywallContext = createContext<PaywallContextValue | null>(null);
