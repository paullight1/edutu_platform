import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { UpgradeSheet } from '../ui/UpgradeSheet';

/**
 * Who currently owns the single monetization slot. `'sheet'` is the shared
 * bottom sheet this provider renders; `'external'` is a screen-local surface
 * (e.g. the CV screen's ProUpgradeModal, which carries the free-trial
 * affordance the shared sheet has no room for).
 */
type FlowOwner = 'sheet' | 'external' | null;

interface UpgradeSheetContextValue {
  /** Open the upgrade bottom sheet, optionally with a context line. No-op while another surface owns the flow. */
  show: (reason?: string) => void;
  hide: () => void;
  /**
   * True while ANY monetization surface is on screen. Unsolicited promos
   * (LoginOfferModal) must check this and suppress themselves — they may never
   * stack on top of a purchase flow the user deliberately started.
   */
  isUpgradeFlowOpen: boolean;
  /**
   * Claim the slot for a screen-local surface. Returns false when someone else
   * already owns it, in which case the caller must NOT render its surface.
   * Every successful claim must be paired with `releaseFlow()` on close.
   */
  claimFlow: () => boolean;
  releaseFlow: () => void;
}

const UpgradeSheetContext = createContext<UpgradeSheetContextValue | null>(null);

export function UpgradeSheetProvider({ children }: { children: React.ReactNode }) {
  const [owner, setOwner] = useState<FlowOwner>(null);
  const [reason, setReason] = useState<string | undefined>(undefined);
  // Mirror of `owner` read synchronously inside callbacks: two surfaces can
  // race within the same tick (a billing error landing while a tap opens the
  // Pro modal), and state hasn't committed yet at that point. The ref is the
  // arbiter; the state exists only to drive rendering.
  const ownerRef = useRef<FlowOwner>(null);

  const show = useCallback((nextReason?: string) => {
    // Something is already on screen — showing a second card would be exactly
    // the stacked-paywall bug this guard exists to prevent.
    if (ownerRef.current !== null) return;
    ownerRef.current = 'sheet';
    setReason(nextReason);
    setOwner('sheet');
  }, []);

  const hide = useCallback(() => {
    // Only the sheet's own owner may close it; a stray hide() from an
    // unrelated screen must not free a slot it never took.
    if (ownerRef.current !== 'sheet') return;
    ownerRef.current = null;
    setOwner(null);
  }, []);

  const claimFlow = useCallback(() => {
    if (ownerRef.current !== null) return false;
    ownerRef.current = 'external';
    setOwner('external');
    return true;
  }, []);

  const releaseFlow = useCallback(() => {
    if (ownerRef.current !== 'external') return;
    ownerRef.current = null;
    setOwner(null);
  }, []);

  const isUpgradeFlowOpen = owner !== null;

  const value = useMemo(
    () => ({ show, hide, isUpgradeFlowOpen, claimFlow, releaseFlow }),
    [show, hide, isUpgradeFlowOpen, claimFlow, releaseFlow],
  );

  return (
    <UpgradeSheetContext.Provider value={value}>
      {children}
      <UpgradeSheet visible={owner === 'sheet'} reason={reason} onClose={hide} />
    </UpgradeSheetContext.Provider>
  );
}

/**
 * Access the shared upgrade sheet. Returns null when no provider is mounted
 * (callers keep an Alert fallback for that case) — never throws.
 */
export function useUpgradeSheet(): UpgradeSheetContextValue | null {
  return useContext(UpgradeSheetContext);
}
