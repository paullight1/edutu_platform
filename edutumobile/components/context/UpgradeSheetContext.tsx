import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { UpgradeSheet } from '../ui/UpgradeSheet';

interface UpgradeSheetContextValue {
  /** Open the upgrade bottom sheet, optionally with a context line. */
  show: (reason?: string) => void;
  hide: () => void;
}

const UpgradeSheetContext = createContext<UpgradeSheetContextValue | null>(null);

export function UpgradeSheetProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);

  const show = useCallback((nextReason?: string) => {
    setReason(nextReason);
    setVisible(true);
  }, []);
  const hide = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <UpgradeSheetContext.Provider value={value}>
      {children}
      <UpgradeSheet visible={visible} reason={reason} onClose={hide} />
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
