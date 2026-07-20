import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import UpgradeModal from '../components/ui/UpgradeModal';
import { useBillingStatus } from './useBillingStatus';
import { isUpgradeRequiredError } from '../services/productApi';
import type { BillingStatus } from '../services/billing';

export interface OpenPaywallInput {
  /** Contextual line shown in the modal, e.g. a 402 message. */
  reason?: string | null;
  /** The feature the user was trying to use (analytics / copy hints). */
  feature?: string | null;
  /** Path to return to after Paystack checkout. Defaults to current path. */
  returnTo?: string;
}

interface PaywallContextValue {
  /** True when the signed-in user has an active Pro entitlement. */
  isPro: boolean;
  /** Full billing status (credits, expiry, transactions) or null when signed out. */
  billing: BillingStatus | null;
  billingLoading: boolean;
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

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const { status, loading, refresh } = useBillingStatus();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

  const openPaywall = useCallback((input: OpenPaywallInput = {}) => {
    setReason(input.reason ?? null);
    setReturnTo(
      input.returnTo ??
        (typeof window !== 'undefined' ? window.location.pathname : undefined),
    );
    setOpen(true);
  }, []);

  const closePaywall = useCallback(() => setOpen(false), []);

  const handleUpgradeError = useCallback(
    (error: unknown): boolean => {
      if (isUpgradeRequiredError(error)) {
        openPaywall({ reason: error.message });
        return true;
      }
      return false;
    },
    [openPaywall],
  );

  const value = useMemo<PaywallContextValue>(
    () => ({
      isPro: status?.isPro ?? false,
      billing: status,
      billingLoading: loading,
      openPaywall,
      closePaywall,
      refreshBilling: refresh,
      handleUpgradeError,
    }),
    [status, loading, openPaywall, closePaywall, refresh, handleUpgradeError],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <UpgradeModal
        open={open}
        onClose={closePaywall}
        reason={reason}
        returnTo={returnTo}
      />
    </PaywallContext.Provider>
  );
}

/** Access the paywall hub. Safe to call anywhere under PaywallProvider. */
export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error('usePaywall must be used within a PaywallProvider');
  }
  return ctx;
}
