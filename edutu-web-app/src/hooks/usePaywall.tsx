import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import UpgradeModal from '../components/ui/UpgradeModal';
import { useBillingStatus } from './useBillingStatus';
import { isUpgradeRequiredError } from '../services/productApi';
import { PaywallContext, type OpenPaywallInput, type PaywallContextValue } from './paywallContext';
export type { OpenPaywallInput } from './paywallContext';

/**
 * The full-page upgrade surface. While the user is on it, the modal must never
 * also open — /upgrade IS the paywall, and stacking the dialog on top of it
 * would show the same plans twice.
 */
const UPGRADE_ROUTE = '/upgrade';

export function PaywallProvider({ children }: { children: ReactNode }) {
  const { status, loading, error, refresh } = useBillingStatus();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const openPaywall = useCallback((input: OpenPaywallInput = {}) => {
    setReason(input.reason ?? (input.feature ? `Unlock ${input.feature.toLowerCase()} with an Edutu paid plan.` : null));
    setOpen(true);
  }, []);

  const closePaywall = useCallback(() => setOpen(false), []);

  const onUpgradePage =
    pathname === UPGRADE_ROUTE || pathname.startsWith(`${UPGRADE_ROUTE}/`);

  // A dialog must not survive a route change — otherwise leaving /upgrade (where
  // it was suppressed) would pop it back open on the next page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleUpgradeError = useCallback(
    (error: unknown): boolean => {
      if (isUpgradeRequiredError(error)) {
        // A paid user at a daily limit should see the reset time, not a checkout.
        if (error.code === "limit" && status?.planTier !== "none") return false;
        openPaywall({ reason: error.message });
        return true;
      }
      return false;
    },
    [openPaywall, status],
  );

  const value = useMemo<PaywallContextValue>(
    () => ({
      isPro: status?.isPro ?? false,
      planTier: status?.planTier ?? 'none',
      billing: status,
      billingLoading: loading,
      billingError: error,
      openPaywall,
      closePaywall,
      refreshBilling: refresh,
      handleUpgradeError,
    }),
    [status, loading, error, openPaywall, closePaywall, refresh, handleUpgradeError],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      {/* Exactly ONE paywall surface can be visible at a time: a single shared
          modal instance (every ProGate / useProFeature call funnels through
          this provider, so gates cannot stack dialogs), and it stays closed on
          the /upgrade page, which is the full-page form of the same thing. */}
      <UpgradeModal
        open={onUpgradePage ? false : open}
        onClose={closePaywall}
        reason={reason}
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

/** Optional form for shared UI that also renders in isolated/public contexts. */
export function useOptionalPaywall(): PaywallContextValue | null {
  return useContext(PaywallContext);
}
